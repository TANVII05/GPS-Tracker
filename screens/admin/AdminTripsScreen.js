import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { COLORS, FONTS, FONT_SIZES, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { fetchAllTrips } from '../../services/googleSheetsService';
import { getAllTrips as getLocalTrips } from '../../utils/storage';
import { detectTripAnomaly, processSheetsEscalation } from '../../services/aiService';
import { formatKM, formatEarnings, formatDuration, getMonthName } from '../../utils/formatters';
import AIAssistantModal from '../../components/AIAssistantModal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_FILTERS = ['All', 'Flagged Only', 'Auto-Cleared'];

export default function AdminTripsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanningAI, setScanningAI] = useState(false);
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState(null);
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [expandedTrip, setExpandedTrip] = useState(null);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiEvaluations, setAiEvaluations] = useState({});

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async (isSilent = false) => {
    try {
      if (!isSilent) setError(null);

      // 1. Try Google Sheets first; if it returns empty/fails, use local storage
      let allTrips = [];
      try {
        const sheetsTrips = await fetchAllTrips();
        if (sheetsTrips && sheetsTrips.length > 0) {
          allTrips = sheetsTrips;
        }
      } catch (_) {}

      // 2. Fall back to local AsyncStorage trips
      if (allTrips.length === 0) {
        const localTrips = await getLocalTrips();
        allTrips = localTrips.map(t => ({
          ...t,
          // Ensure month/year are present for filtering
          month: t.month || (t.date ? new Date(t.date).getMonth() + 1 : new Date().getMonth() + 1),
          year: t.year || (t.date ? new Date(t.date).getFullYear() : new Date().getFullYear()),
          employeeId: t.employeeId || t.id || 'unknown',
          employeeName: t.employeeName || t.name || 'Employee',
        }));
      }

      allTrips.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setTrips(allTrips);
      
      // Pre-evaluate trips with speed-based anomaly heuristics
      const evals = {};
      allTrips.forEach(t => {
        const dur = Number(t.durationMinutes || 0);
        const dist = Number(t.distanceKM || 0);
        const speed = dur > 0 ? (dist / (dur / 60)) : 0;
        const isFlagged = (t.reviewStatus === 'needs_manager_review') || (speed > 85) || (dur === 0 && dist > 0);
        evals[t.id || `${t.employeeId}-${t.date}-${t.outTime}`] = {
          flag: isFlagged ? 'suspicious' : 'normal',
          speed: speed,
          reason: isFlagged 
            ? (t.anomalyReason || `Flagged: Average speed ${speed.toFixed(1)} km/h exceeds two-wheeler threshold.`)
            : (t.anomalyReason || `Normal speed (${speed.toFixed(1)} km/h) — auto-cleared.`),
          resolutionNode: (speed < 60 || speed > 150) ? 'Rule-Based' : 'AI Reasoning'
        };
      });
      setAiEvaluations(evals);

    } catch (e) {
      if (!isSilent) setError('Could not load trips.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const [scanResultText, setScanResultText] = useState(null);

  const handleRunAIScan = async () => {
    setScanningAI(true);
    setScanResultText(null);
    try {
      // 1. Process on AI backend or local fallback
      const result = await processSheetsEscalation(trips);
      // 2. Refresh local evaluations
      await loadData(true);
      
      const msg = result?.offline_mode 
        ? `Analyzed ${result.total_processed} trips locally.\nFlagged: ${result.flagged} | Auto-Cleared: ${result.cleared}`
        : `Analyzed ${result.total_processed} trips via AI Backend.\nFlagged: ${result.needs_manager_review} | Auto-Cleared: ${result.auto_cleared}`;
        
      if (Platform.OS === 'web') {
        setScanResultText(msg);
        setTimeout(() => setScanResultText(null), 8000);
      } else {
        Alert.alert('⚡ AI Anomaly Check Complete', msg);
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        setScanResultText('Scan failed. Please try again.');
        setTimeout(() => setScanResultText(null), 5000);
      } else {
        Alert.alert('AI Scan Failed', 'Could not analyze trips. Please try again.');
      }
    } finally {
      setScanningAI(false);
    }
  };

  const employees = useMemo(() => {
    const ids = new Set();
    const list = [{ id: 'All', name: 'All Employees' }];
    trips.forEach(t => {
      if (!ids.has(t.employeeId)) {
        ids.add(t.employeeId);
        list.push({ id: t.employeeId, name: t.employeeName });
      }
    });
    return list;
  }, [trips]);

  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      const tripKey = t.id || `${t.employeeId}-${t.date}-${t.outTime}`;
      const aiEval = aiEvaluations[tripKey];

      // month field is 1-indexed (1=Jan), selectedMonth is 0-indexed (0=Jan)
      let tripMonth;
      if (t.month !== undefined && t.month !== null && t.month !== '') {
        tripMonth = parseInt(t.month, 10) - 1; // convert to 0-indexed
      } else if (t.date) {
        tripMonth = new Date(t.date).getMonth(); // already 0-indexed
      } else {
        tripMonth = -1; // unknown, won't match
      }
      const isMonthMatch = tripMonth === selectedMonth;
      const isEmployeeMatch = selectedEmployee === 'All' || t.employeeId === selectedEmployee;
      
      let isStatusMatch = true;
      if (selectedStatus === 'Flagged Only') {
        isStatusMatch = aiEval?.flag === 'suspicious';
      } else if (selectedStatus === 'Auto-Cleared') {
        isStatusMatch = aiEval?.flag === 'normal';
      }

      return isMonthMatch && isEmployeeMatch && isStatusMatch;
    });
  }, [trips, selectedMonth, selectedEmployee, selectedStatus, aiEvaluations]);

  const exportPDF = async () => {
    try {
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { color: #333788; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #333788; color: white; }
              tr:nth-child(even) { background-color: #f4f4fb; }
            </style>
          </head>
          <body>
            <h1>NCH GPS Tracker — Trip Report</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <p>Report Period: ${MONTHS[selectedMonth]} ${new Date().getFullYear()}</p>
            <p>Employee: ${employees.find(e => e.id === selectedEmployee)?.name}</p>
            
            <table>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Employee</th>
                <th>Bike</th>
                <th>OUT</th>
                <th>IN</th>
                <th>KM</th>
                <th>Earnings</th>
              </tr>
              ${filteredTrips.map((t, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${t.date}</td>
                  <td>${t.employeeName}</td>
                  <td>${t.bikeNumber}</td>
                  <td>${t.outTime}</td>
                  <td>${t.inTime}</td>
                  <td>${formatKM(t.distanceKM)}</td>
                  <td>${formatEarnings(t.earnings)}</td>
                </tr>
              `).join('')}
            </table>
          </body>
        </html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (error) {
      Alert.alert('Export Error', 'Failed to generate PDF');
    }
  };

  const renderTripCard = ({ item }) => {
    const isExpanded = expandedTrip === item.id;
    const tripKey = item.id || `${item.employeeId}-${item.date}-${item.outTime}`;
    const aiEval = aiEvaluations[tripKey];
    const isFlagged = aiEval?.flag === 'suspicious';

    return (
      <TouchableOpacity 
        style={[styles.tripCard, isFlagged && styles.tripCardFlagged]}
        onPress={() => setExpandedTrip(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.tripCardHeader}>
          <View style={styles.nameContainer}>
            <Text style={styles.tripName}>{item.employeeName || 'Unknown'}</Text>
            {/* AI Review Status Badge */}
            {isFlagged ? (
              <View style={styles.badgeFlagged}>
                <Ionicons name="warning" size={11} color="#C62828" />
                <Text style={styles.badgeFlaggedText}>Needs Review</Text>
              </View>
            ) : (
              <View style={styles.badgeCleared}>
                <Ionicons name="checkmark-circle" size={11} color="#2E7D32" />
                <Text style={styles.badgeClearedText}>Auto-Cleared</Text>
              </View>
            )}
          </View>
          <Text style={styles.tripDate}>{item.date}</Text>
        </View>
        
        <Text style={styles.tripSub}>{item.employeeId} • {item.bikeNumber}</Text>
        
        <View style={styles.tripRow}>
          <Text style={styles.tripTime}>{item.outTime || '--'} &rarr; {item.inTime || 'Active'}</Text>
          {aiEval?.speed !== undefined && (
            <Text style={styles.speedIndicator}>
              ⚡ {aiEval.speed.toFixed(1)} km/h
            </Text>
          )}
        </View>
        
        <View style={styles.tripMetrics}>
          <Text style={styles.tripMetricText}>{formatKM(item.distanceKM)}</Text>
          <Text style={styles.tripMetricText}>|</Text>
          <Text style={styles.tripMetricText}>{item.durationMinutes ? `${item.durationMinutes}m` : 'Live'}</Text>
          <Text style={styles.tripMetricText}>|</Text>
          <Text style={[styles.tripMetricText, { color: COLORS.success, fontFamily: FONTS.bold }]}>
            {formatEarnings(item.earnings)}
          </Text>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>Duration: </Text>
              {item.durationMinutes ? `${Math.floor(item.durationMinutes/60)}h ${item.durationMinutes%60}m` : 'Active'}
            </Text>
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>Month/Year: </Text>
              {getMonthName(parseInt(item.month))} {item.year}
            </Text>

            {/* AI Fraud & Anomaly Audit Box */}
            <View style={[styles.aiAuditBox, isFlagged ? styles.aiAuditBoxFlagged : styles.aiAuditBoxCleared]}>
              <View style={styles.aiAuditHeader}>
                <Ionicons 
                  name={isFlagged ? "shield-outline" : "shield-checkmark-outline"} 
                  size={14} 
                  color={isFlagged ? "#C62828" : "#2E7D32"} 
                />
                <Text style={[styles.aiAuditTitle, { color: isFlagged ? "#C62828" : "#2E7D32" }]}>
                  AI Fraud & Anomaly Audit ({aiEval?.resolutionNode || 'AI'})
                </Text>
              </View>
              <Text style={styles.aiAuditReason}>
                {aiEval?.reason || 'Evaluation in progress'}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Top Header with AI Assistant & PDF Export */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>All Trips</Text>
          <Text style={styles.headerSub}>AI Anomaly & Payroll Audit</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.aiAssistBtn} 
            onPress={() => setAiModalVisible(true)}
          >
            <Ionicons name="sparkles" size={14} color="#FFFFFF" />
            <Text style={styles.aiAssistBtnText}>Ask AI</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportBtn} onPress={exportPDF}>
            <Ionicons name="document-text" size={14} color={COLORS.white} />
            <Text style={styles.exportText}>PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* AI Scan Action Bar */}
      <View style={styles.aiBanner}>
        <View style={styles.aiBannerLeft}>
          <Ionicons name="hardware-chip-outline" size={16} color="#333788" />
          <Text style={styles.aiBannerText}>AI Anomaly Detection Active</Text>
        </View>
        <TouchableOpacity 
          style={styles.aiScanBtn} 
          onPress={handleRunAIScan}
          disabled={scanningAI}
        >
          {scanningAI ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="refresh" size={12} color="#FFFFFF" />
              <Text style={styles.aiScanBtnText}>Run AI Scan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {scanResultText && (
        <View style={{ backgroundColor: '#E8F5E9', padding: 8, marginHorizontal: 16, borderRadius: 8, marginBottom: 8 }}>
          <Text style={{ color: '#2E7D32', fontSize: 13, textAlign: 'center' }}>{scanResultText}</Text>
        </View>
      )}

      {/* Status Filter Chips */}
      <View style={styles.statusFilterRow}>
        {STATUS_FILTERS.map(st => (
          <TouchableOpacity
            key={st}
            style={[
              styles.statusChip,
              selectedStatus === st && styles.statusChipActive,
              st === 'Flagged Only' && selectedStatus === st && styles.statusChipFlaggedActive,
            ]}
            onPress={() => setSelectedStatus(st)}
          >
            <Text
              style={[
                styles.statusChipText,
                selectedStatus === st && styles.statusChipTextActive,
              ]}
            >
              {st}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Month & Employee Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          {MONTHS.map((m, i) => (
            <TouchableOpacity 
              key={m}
              style={[styles.monthChip, selectedMonth === i && styles.monthChipActive]}
              onPress={() => setSelectedMonth(i)}
            >
              <Text style={[styles.monthText, selectedMonth === i && styles.monthTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.empScroll}>
          {employees.map(emp => (
            <TouchableOpacity 
              key={emp.id}
              style={[styles.empChip, selectedEmployee === emp.id && styles.empChipActive]}
              onPress={() => setSelectedEmployee(emp.id)}
            >
              <Text style={[styles.empText, selectedEmployee === emp.id && styles.empTextActive]}>{emp.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTrips}
          keyExtractor={(item, idx) => item.id || `trip-${idx}`}
          renderItem={renderTripCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No trips found matching the filters</Text>
            </View>
          }
        />
      )}

      {/* Interactive AI Query Assistant Modal */}
      <AIAssistantModal
        visible={aiModalVisible}
        onClose={() => setAiModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    ...SHADOWS.subtle,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiAssistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333788',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    gap: 4,
    ...SHADOWS.subtle,
  },
  aiAssistBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5c5f8a',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    gap: 4,
  },
  exportText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef0ff',
    paddingHorizontal: SPACING.base,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e1f5',
  },
  aiBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333788',
  },
  aiScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333788',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  aiScanBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.base,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#f0f0fa',
  },
  statusChipActive: {
    backgroundColor: '#333788',
  },
  statusChipFlaggedActive: {
    backgroundColor: '#C62828',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5c5f8a',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  filtersContainer: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  monthScroll: { paddingHorizontal: SPACING.base, paddingBottom: 6 },
  empScroll: { paddingHorizontal: SPACING.base },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 6,
    borderRadius: 12,
    backgroundColor: '#f8f8fd',
    borderWidth: 1,
    borderColor: '#e0e1f5',
  },
  monthChipActive: { backgroundColor: '#333788', borderColor: '#333788' },
  monthText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  monthTextActive: { color: COLORS.white, fontWeight: '700' },
  empChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    borderRadius: 12,
    backgroundColor: '#f8f8fd',
    borderWidth: 1,
    borderColor: '#e0e1f5',
  },
  empChipActive: { backgroundColor: '#5c5f8a', borderColor: '#5c5f8a' },
  empText: { fontSize: 11, color: COLORS.textSecondary },
  empTextActive: { color: COLORS.white, fontWeight: '700' },
  listContent: { padding: SPACING.base },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.base,
    borderWidth: 1,
    borderColor: '#e0e1f5',
    ...SHADOWS.card,
  },
  tripCardFlagged: {
    borderColor: '#ffcdd2',
    backgroundColor: '#fffdfd',
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badgeFlagged: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  badgeFlaggedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C62828',
  },
  badgeCleared: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  badgeClearedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
  },
  tripDate: { fontSize: 12, color: COLORS.textSecondary },
  tripSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  tripTime: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  speedIndicator: { fontSize: 11, fontWeight: '600', color: '#5c5f8a' },
  tripMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0fa',
  },
  tripMetricText: { fontSize: 13, color: COLORS.textPrimary },
  expandedContent: { marginTop: 10 },
  divider: { height: 1, backgroundColor: '#f0f0fa', marginVertical: 8 },
  detailText: { fontSize: 12, color: COLORS.textPrimary, marginBottom: 4 },
  detailLabel: { fontWeight: '700', color: COLORS.textSecondary },
  aiAuditBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  aiAuditBoxFlagged: {
    backgroundColor: '#fff5f5',
    borderColor: '#ffcdd2',
  },
  aiAuditBoxCleared: {
    backgroundColor: '#f4faf4',
    borderColor: '#c8e6c9',
  },
  aiAuditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  aiAuditTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  aiAuditReason: {
    fontSize: 12,
    color: '#1a1a2e',
    lineHeight: 16,
  },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: COLORS.danger, fontSize: 14 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: COLORS.textSecondary, marginTop: 10, fontSize: 14 },
});
