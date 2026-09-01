// services/aiService.js
// Connects React Native frontend to the Python FastAPI AI backend service

import { getAllTrips } from '../utils/storage';

const DEFAULT_HOST = "172.20.10.3";
export const AI_SERVICE_URL = process.env.EXPO_PUBLIC_AI_SERVICE_URL || `http://${DEFAULT_HOST}:8000`;

const FETCH_TIMEOUT_MS = 8000; // 8 seconds — if backend doesn't respond, give up

/**
 * Fetch with a timeout so requests never hang forever
 */
async function fetchWithTimeout(url, options = {}) {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options); // Fallback for environments without AbortController
  }
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * Checks if the Python AI service is reachable
 */
export async function checkAIHealth() {
  try {
    const res = await fetchWithTimeout(`${AI_SERVICE_URL}/health`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * Runs a single trip through the Anomaly Detection flow
 */
export async function detectTripAnomaly(tripData) {
  try {
    const res = await fetchWithTimeout(`${AI_SERVICE_URL}/api/v1/anomaly/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_name: tripData.employeeName || 'Unknown',
        employee_id: tripData.employeeId || 'Unknown',
        bike_number: tripData.bikeNumber || 'N/A',
        date: tripData.date || '',
        out_time: tripData.outTime || '',
        in_time: tripData.inTime || '',
        duration_minutes: Number(tripData.durationMinutes || 0),
        distance_km: Number(tripData.distanceKM || 0),
        earnings: Number(tripData.earnings || 0),
      }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return await res.json();
  } catch (e) {
    // Offline fallback using local speed heuristic
    const dur = Number(tripData.durationMinutes || 0);
    const dist = Number(tripData.distanceKM || 0);
    const speed = dur > 0 ? (dist / (dur / 60)) : 0;
    const isSuspicious = speed > 85 || (dur === 0 && dist > 0);
    return {
      flag: isSuspicious ? 'suspicious' : 'normal',
      reason: isSuspicious
        ? `High speed (${speed.toFixed(1)} km/h) — flagged locally.`
        : `Normal travel speed (${speed.toFixed(1)} km/h).`,
      confidence: 0.9,
      resolution_node: 'Rule-Based',
      speed_kmh: speed,
    };
  }
}

/**
 * Triggers batch AI scan. Falls back to local heuristics if backend is offline.
 */
export async function processSheetsEscalation(trips = []) {
  try {
    const mappedTrips = trips.map(t => ({
      employee_name: t.employeeName,
      employee_id: t.employeeId,
      bike_number: t.bikeNumber,
      date: t.date,
      out_time: t.outTime,
      in_time: t.inTime,
      duration_minutes: Number(t.durationMinutes || 0),
      distance_km: Number(t.distanceKM || 0),
      earnings: Number(t.earnings || 0),
      month: String(t.month || ''),
      year: String(t.year || ''),
      review_status: t.reviewStatus || 'pending',
      anomaly_reason: t.anomalyReason || ''
    }));

    const res = await fetchWithTimeout(`${AI_SERVICE_URL}/api/v1/sheets/process-trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trips: mappedTrips }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return await res.json();
  } catch (e) {
    // Offline: run local heuristic scan over all provided trips
    let flaggedCount = 0;
    let clearedCount = 0;
    const localTrips = trips.length > 0 ? trips : await getAllTrips();
    localTrips.forEach(t => {
      const dur = Number(t.durationMinutes || 0);
      const dist = Number(t.distanceKM || 0);
      const speed = dur > 0 ? (dist / (dur / 60)) : 0;
      if (speed > 85 || (dur === 0 && dist > 0)) {
        flaggedCount++;
      } else {
        clearedCount++;
      }
    });
    return {
      offline_mode: true,
      total_processed: localTrips.length,
      flagged: flaggedCount,
      cleared: clearedCount,
    };
  }
}

/**
 * Offline smart answer — reads local trips and responds to common questions
 */
function buildOfflineAnswer(question, trips) {
  const q = question.toLowerCase();
  
  // Greetings / general (works even if no trips)
  if (q.includes('hi') || q.includes('hello') || q.includes('hey')) {
    return `Hello! I can answer questions about your trip data. Try asking:\n• "How many trips were recorded?"\n• "Total earnings this month"\n• "Which trips are flagged for review?"\n• "How many km did [name] travel?"`;
  }

  const total = trips.length;
  if (total === 0) {
    return 'No trip data found on this device yet. Record some trips first.';
  }

  // Flagged trips
  if (q.includes('flag') || q.includes('review') || q.includes('suspicious') || q.includes('anomal')) {
    const flagged = trips.filter(t => {
      const dur = Number(t.durationMinutes || 0);
      const dist = Number(t.distanceKM || 0);
      const speed = dur > 0 ? (dist / (dur / 60)) : 0;
      return speed > 85 || (dur === 0 && dist > 0);
    });
    if (flagged.length === 0) return `All ${total} recorded trips look normal. No suspicious speed anomalies detected.`;
    return `${flagged.length} out of ${total} trips are flagged:\n` +
      flagged.slice(0, 5).map(t => `• ${t.employeeName || 'Employee'} on ${t.date} — ${t.distanceKM || 0} km`).join('\n');
  }

  // KM / distance
  if (q.includes('km') || q.includes('distance') || q.includes('kilomet')) {
    const totalKM = trips.reduce((s, t) => s + Number(t.distanceKM || 0), 0);
    const names = [...new Set(trips.map(t => t.employeeName))].filter(Boolean);
    // Check if asking about a specific person
    for (const name of names) {
      if (q.includes(name.toLowerCase())) {
        const empTrips = trips.filter(t => t.employeeName === name);
        const empKM = empTrips.reduce((s, t) => s + Number(t.distanceKM || 0), 0);
        return `${name} has covered ${empKM.toFixed(2)} km across ${empTrips.length} trips.`;
      }
    }
    return `Total distance across all ${total} trips: ${totalKM.toFixed(2)} km.`;
  }

  // Earnings / payout
  if (q.includes('earn') || q.includes('pay') || q.includes('reimburse') || q.includes('₹') || q.includes('rupee')) {
    const totalEarn = trips.reduce((s, t) => s + Number(t.earnings || 0), 0);
    const names = [...new Set(trips.map(t => t.employeeName))].filter(Boolean);
    for (const name of names) {
      if (q.includes(name.toLowerCase())) {
        const empTrips = trips.filter(t => t.employeeName === name);
        const empEarn = empTrips.reduce((s, t) => s + Number(t.earnings || 0), 0);
        return `${name}'s total earnings: ₹${empEarn.toFixed(2)} across ${empTrips.length} trips.`;
      }
    }
    return `Total payout across all trips: ₹${totalEarn.toFixed(2)} (${total} trips).`;
  }

  // Trip count
  if (q.includes('how many trip') || q.includes('total trip') || q.includes('number of trip')) {
    const names = [...new Set(trips.map(t => t.employeeName))].filter(Boolean);
    for (const name of names) {
      if (q.includes(name.toLowerCase())) {
        const count = trips.filter(t => t.employeeName === name).length;
        return `${name} has ${count} recorded trip${count !== 1 ? 's' : ''}.`;
      }
    }
    return `There are ${total} trips recorded in total.`;
  }

  // Employee list
  if (q.includes('employee') || q.includes('rider') || q.includes('staff') || q.includes('who')) {
    const names = [...new Set(trips.map(t => t.employeeName))].filter(Boolean);
    if (names.length === 0) return 'No employee names found in trip records.';
    return `Employees with recorded trips:\n${names.map(n => `• ${n}`).join('\n')}`;
  }

  // Generic summary
  const totalKM = trips.reduce((s, t) => s + Number(t.distanceKM || 0), 0);
  const totalEarn = trips.reduce((s, t) => s + Number(t.earnings || 0), 0);
  const names = [...new Set(trips.map(t => t.employeeName))].filter(Boolean);
  return `Here's a summary of your trip data:\n• ${total} trips recorded\n• ${totalKM.toFixed(1)} km total distance\n• ₹${totalEarn.toFixed(0)} total earnings\n• ${names.length} employee(s): ${names.join(', ')}\n\nAsk me something more specific!`;
}

/**
 * Asks a plain-English question. Uses backend if available, falls back to local data.
 */
export async function askAIQuery(question, modelName = 'gpt-4o-mini') {
  const startTime = Date.now();

  // 1. Try the backend
  try {
    const localTrips = await getAllTrips();
    const mappedTrips = localTrips.map(t => ({
      employee_name: t.employeeName,
      employee_id: t.employeeId,
      bike_number: t.bikeNumber,
      date: t.date,
      out_time: t.outTime,
      in_time: t.inTime,
      duration_minutes: Number(t.durationMinutes || 0),
      distance_km: Number(t.distanceKM || 0),
      earnings: Number(t.earnings || 0),
      month: String(t.month || ''),
      year: String(t.year || ''),
      review_status: t.reviewStatus || 'pending',
      anomaly_reason: t.anomalyReason || ''
    }));

    const res = await fetchWithTimeout(`${AI_SERVICE_URL}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, model_name: modelName, trips: mappedTrips }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return await res.json();
  } catch (e) {
    // Backend unreachable — use local trip data to answer
  }

  // 2. Offline fallback: read local trips and answer smartly
  try {
    const trips = await getAllTrips();
    const answer = buildOfflineAnswer(question, trips);
    return {
      answer,
      source_rows_used: trips.slice(0, 3).map((_, i) => i + 1),
      model_used: 'offline_local',
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      latency_ms: Date.now() - startTime,
    };
  } catch (_) {
    return {
      answer: 'Something went wrong reading local trip data. Please try again.',
      source_rows_used: [],
      model_used: 'offline_local',
      total_tokens: 0,
      latency_ms: 0,
    };
  }
}
