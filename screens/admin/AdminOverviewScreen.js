import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, FONT_SIZES, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { fetchAllTrips, fetchActiveLocations } from '../../services/googleSheetsService';
import { formatKM, formatEarnings, getMonthName } from '../../utils/formatters';
import AIAssistantModal from '../../components/AIAssistantModal';

export default function AdminOverviewScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedTrip, setExpandedTrip] = useState(null);
  const [activeLocations, setActiveLocations] = useState([]);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  
  const [stats, setStats] = useState({
    todayTrips: 0,
    todayKM: 0,
    todayEarnings: 0,
    activeEmployees: 0,
    monthTrips: 0,
    monthKM: 0,
    monthEarnings: 0,
  });
  const [todayTripsList, setTodayTripsList] = useState([]);
  
  const today = new Date();
  const todayDateString = today.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  
  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds as requested
    const interval = setInterval(() => {
      loadData(true); // silent background load
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async (isSilent = false) => {
    try {
      if (!isSilent) setError(null);
      
      const [allTrips, activeLocs] = await Promise.all([
        fetchAllTrips(),
        fetchActiveLocations()
      ]);
      
      setActiveLocations(activeLocs);
      
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentYear = now.getFullYear();
      
      let tTrips = 0, tKM = 0, tEarn = 0;
      let mTrips = 0, mKM = 0, mEarn = 0;
      const activeIds = new Set();
      const todayList = [];
      
      const todayString = now.toDateString();
      
      allTrips.forEach(trip => {
        // Month stats
        if (trip.month == currentMonth && trip.year == currentYear) {
          mTrips++;
          mKM += parseFloat(trip.distanceKM || 0);
          mEarn += parseFloat(trip.earnings || 0);
        }
        
        // Today stats
        let isToday = false;
        if (trip.date) {
           const d = new Date(trip.date);
           if (!isNaN(d) && d.toDateString() === todayString) isToday = true;
           if (trip.date.includes(todayDateString)) isToday = true;
        }
        
        if (isToday) {
          tTrips++;
          tKM += parseFloat(trip.distanceKM || 0);
          tEarn += parseFloat(trip.earnings || 0);
          activeIds.add(trip.employeeId);
          todayList.push(trip);
        }
      });
      
      setStats({
        todayTrips: tTrips,
        todayKM: tKM,
        todayEarnings: tEarn,
        activeEmployees: activeLocs.length, // use activeLocations length
        monthTrips: mTrips,
        monthKM: mKM,
        monthEarnings: mEarn,
      });
      
      todayList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setTodayTripsList(todayList);
      
    } catch (e) {
      if (!isSilent) setError('Could not load data. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderStatCard = (title, value, icon, color) => (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Ionicons name={icon} size={24} color={color} style={styles.statIcon} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{title}</Text>
    </View>
  );

  const openInGoogleMaps = (lat, lng) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      alert('Could not open map link');
    });
  };

  const renderActiveEmployee = ({ item }) => (
    <View style={styles.activeLocCard}>
      <View style={styles.activeLocHeader}>
        <View>
          <Text style={styles.activeLocName}>{item.employeeName}</Text>
          <Text style={styles.activeLocId}>ID: {item.employeeId} • {item.bikeNumber}</Text>
        </View>
        <TouchableOpacity 
          style={styles.mapBtn}
          onPress={() => openInGoogleMaps(item.latitude, item.longitude)}
        >
          <Ionicons name="map-outline" size={16} color={COLORS.white} />
          <Text style={styles.mapBtnText}>Track</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.activeLocStats}>
        <View style={styles.activeLocStatItem}>
          <Text style={styles.activeLocStatVal}>{formatKM(item.distanceKM)}</Text>
          <Text style={styles.activeLocStatLbl}>Distance</Text>
        </View>
        <View style={styles.activeLocStatItem}>
          <Text style={[styles.activeLocStatVal, { color: COLORS.success }]}>{formatEarnings(item.earnings)}</Text>
          <Text style={styles.activeLocStatLbl}>Earnings</Text>
        </View>
        <View style={styles.activeLocStatItem}>
          <Text style={styles.activeLocStatVal}>
            {item.lastUpdated ? new Date(item.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
          </Text>
          <Text style={styles.activeLocStatLbl}>Last Sync</Text>
        </View>
      </View>
      
      <Text style={styles.coordsLabel}>Coords: {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</Text>
    </View>
  );

  const renderTripCard = ({ item }) => {
    const isExpanded = expandedTrip === item.id;
    return (
      <TouchableOpacity 
        style={styles.tripCard}
        onPress={() => setExpandedTrip(isExpanded ? null : item.id)}
        activeOpacity={0.85}
      >
        <View style={styles.tripCardHeader}>
          <Text style={styles.tripName}>{item.employeeName || 'Unknown'}</Text>
          <Text style={styles.tripId}>{item.employeeId}</Text>
        </View>
        <View style={styles.tripRow}>
          <Text style={styles.tripTime}>{item.outTime ? new Date(item.outTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'} &rarr; {item.inTime ? new Date(item.inTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Active'}</Text>
          <Text style={styles.tripDuration}>{item.durationMinutes ? `${item.durationMinutes}m` : 'Live'}</Text>
        </View>
        <View style={styles.tripMetrics}>
          <Text style={styles.tripMetricText}>{formatKM(item.distanceKM)}</Text>
          <Text style={styles.tripMetricText}>|</Text>
          <Text style={[styles.tripMetricText, { color: COLORS.success, fontFamily: FONTS.bold }]}>
            {formatEarnings(item.earnings)}
          </Text>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />
            <Text style={styles.detailText}><Text style={styles.detailLabel}>Bike Number: </Text>{item.bikeNumber || 'N/A'}</Text>
            <Text style={styles.detailText}><Text style={styles.detailLabel}>Trip Date: </Text>{item.date || 'N/A'}</Text>
            <Text style={styles.detailText}><Text style={styles.detailLabel}>Month/Year: </Text>{getMonthName(parseInt(item.month))} {item.year}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error && !todayTripsList.length) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.danger} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadData()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={todayTripsList}
        keyExtractor={(item, index) => item.id || `trip-${index}`}
        renderItem={renderTripCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          <>
            {/* Greeting Header */}
            <View style={styles.greetingHeader}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.greetingTitle}>Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 17 ? 'Afternoon' : 'Evening'}, Admin 👋</Text>
                  <Text style={styles.greetingDate}>
                    {today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.aiOverviewBtn}
                  onPress={() => setAiModalVisible(true)}
                >
                  <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                  <Text style={styles.aiOverviewBtnText}>Ask AI</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* AI Assistant Quick Card */}
            <TouchableOpacity 
              style={styles.aiQuickCard}
              onPress={() => setAiModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.aiQuickLeft}>
                <View style={styles.aiQuickIcon}>
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiQuickTitle}>AI Travel Assistant</Text>
                  <Text style={styles.aiQuickSub}>Ask plain-English questions about trips, anomalies & payouts</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#333788" />
            </TouchableOpacity>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              {renderStatCard('Today\'s Trips', stats.todayTrips, 'document-text', COLORS.primary)}
              {renderStatCard('Total KM', formatKM(stats.todayKM).replace(' KM',''), 'car', COLORS.primary)}
              {renderStatCard('Earnings (₹)', stats.todayEarnings.toFixed(2), 'cash', COLORS.success)}
              {renderStatCard('Active Rides', stats.activeEmployees, 'navigate', COLORS.primary)}
            </View>

            {/* Live Tracking Section */}
            <View style={{ marginBottom: SPACING.lg }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Live Tracking (Auto-sync 30s)</Text>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>
              {activeLocations.length > 0 ? (
                <FlatList
                  data={activeLocations}
                  renderItem={renderActiveEmployee}
                  keyExtractor={(item, index) => `active-${item['Employee ID'] || item.employeeId || index}-${index}`}
                  scrollEnabled={false}
                />
              ) : (
                <View style={styles.emptyLiveCard}>
                  <Ionicons name="location-outline" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.emptyLiveText}>No active rides at the moment</Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Today's Trips</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No trips recorded today</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.monthCard}>
            <Text style={styles.monthCardTitle}>{getMonthName(today.getMonth() + 1)} {today.getFullYear()}</Text>
            <View style={styles.monthStatsRow}>
              <View style={styles.monthStatItem}>
                <Text style={styles.monthStatValue}>{stats.monthTrips}</Text>
                <Text style={styles.monthStatLabel}>Trips</Text>
              </View>
              <View style={styles.monthStatItem}>
                <Text style={styles.monthStatValue}>{formatKM(stats.monthKM).replace(' KM','')}</Text>
                <Text style={styles.monthStatLabel}>KM</Text>
              </View>
              <View style={styles.monthStatItem}>
                <Text style={styles.monthStatValue}>₹{stats.monthEarnings.toFixed(0)}</Text>
                <Text style={styles.monthStatLabel}>Earnings</Text>
              </View>
            </View>
          </View>
        }
      />

      {/* Interactive AI Assistant Modal */}
      <AIAssistantModal
        visible={aiModalVisible}
        onClose={() => setAiModalVisible(false)}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
  },
  listContent: {
    padding: SPACING.base,
    paddingBottom: SPACING.xxxl,
  },
  aiOverviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    gap: 4,
  },
  aiOverviewBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  aiQuickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: SPACING.base,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#dcdffa',
    ...SHADOWS.card,
  },
  aiQuickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  aiQuickIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#333788',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiQuickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  aiQuickSub: {
    fontSize: 11,
    color: '#5c5f8a',
    marginTop: 2,
  },
  greetingHeader: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  greetingTitle: {
    color: COLORS.white,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.lg,
  },
  greetingDate: {
    color: COLORS.white,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.sm,
    opacity: 0.8,
    marginTop: SPACING.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.subtle,
  },
  statHeader: {
    alignItems: 'flex-end',
    marginBottom: SPACING.sm,
  },
  statValue: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.xl,
    color: COLORS.primary,
  },
  statLabel: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.lg,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.subtle,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  tripName: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.base,
    color: COLORS.textPrimary,
  },
  tripId: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  tripTime: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  tripDuration: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
  },
  tripMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  tripMetricText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
  },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.base,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
  },
  monthCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginTop: SPACING.xl,
    ...SHADOWS.card,
  },
  monthCardTitle: {
    color: COLORS.white,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.lg,
    marginBottom: SPACING.md,
  },
  monthStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthStatItem: {
    alignItems: 'center',
  },
  monthStatValue: {
    color: COLORS.white,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.xl,
  },
  monthStatLabel: {
    color: COLORS.white,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.xs,
    opacity: 0.8,
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.base,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  retryText: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
  },
  activeLocCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.md,
    ...SHADOWS.subtle,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
  },
  activeLocHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  activeLocName: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.base,
    color: COLORS.textPrimary,
  },
  activeLocId: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.pill,
  },
  mapBtnText: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZES.xs,
    marginLeft: 4,
  },
  activeLocStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.xs,
  },
  activeLocStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  activeLocStatVal: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
  },
  activeLocStatLbl: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  coordsLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 125, 50, 0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: 4,
  },
  liveText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.success,
  },
  expandedContent: {
    marginTop: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  detailText: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  detailLabel: {
    fontFamily: FONTS.semiBold,
    color: COLORS.textPrimary,
  },
  emptyLiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    ...SHADOWS.subtle,
    gap: SPACING.sm,
  },
  emptyLiveText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});

