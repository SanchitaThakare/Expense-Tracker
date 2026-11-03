import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryFilter } from '@/components/ui/CategoryFilter';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TransactionRow } from '@/components/ui/TransactionRow';
import { Body, Heading, Muted } from '@/components/ui/Typography';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import { shareTransactionsCsv } from '@/lib/exportCsv';
import { addDays, monthLabel, shiftMonth, toISODate } from '@/lib/format';
import { filterActivity, sortActivity, type ActivitySort } from '@/lib/transactionFilters';
import type { Category, Transaction, TransactionType } from '@/lib/types';

type DateRange = 'month' | 'today' | 'week' | 'all';

const DATE_FILTERS: { label: string; value: DateRange }[] = [
  { label: 'This month', value: 'month' },
  { label: 'Today', value: 'today' },
  { label: '7 days', value: 'week' },
  { label: 'All time', value: 'all' },
];

const SORTS: { label: string; value: ActivitySort }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Amount', value: 'amount' },
];

export default function TransactionsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { transactions, month, setMonth, searchTransactions } = useFinance();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TransactionType | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [sort, setSort] = useState<ActivitySort>('newest');
  const [limit, setLimit] = useState(20);
  const [remote, setRemote] = useState<Transaction[] | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [filterError, setFilterError] = useState('');
  const today = toISODate();

  useEffect(() => {
    setLimit(20);
  }, [query, type, category, dateRange, sort, month]);

  useEffect(() => {
    if (dateRange === 'month') {
      setRemote(null);
      setLoadingRemote(false);
      setFilterError('');
      return;
    }
    let cancelled = false;
    setLoadingRemote(true);
    setFilterError('');
    const from = dateRange === 'today' ? today : dateRange === 'week' ? addDays(today, -6) : undefined;
    const to = dateRange === 'all' ? undefined : today;
    searchTransactions({ query, type, category, from, to })
      .then((rows) => {
        if (!cancelled) setRemote(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setRemote([]);
          setFilterError('Those dates could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRemote(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateRange, query, type, category, searchTransactions, today]);

  const filtered = useMemo(() => {
    if (dateRange === 'month') {
      return filterActivity(transactions, { query, type, category, sort });
    }
    return sortActivity(remote ?? [], sort);
  }, [dateRange, transactions, remote, query, type, category, sort]);

  const filtersActive = Boolean(query.trim() || type !== 'all' || category !== 'all' || dateRange !== 'month' || sort !== 'newest');

  function clearFilters() {
    setQuery('');
    setType('all');
    setCategory('all');
    setDateRange('month');
    setSort('newest');
  }

  async function exportCsv() {
    if (loadingRemote) {
      Alert.alert('Still loading', 'Wait for the list to finish, then export.');
      return;
    }
    if (!filtered.length) {
      Alert.alert('Nothing to export', 'Adjust the filters or add a transaction first.');
      return;
    }
    try {
      await shareTransactionsCsv(filtered);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share CSV');
    }
  }

  const visible = filtered.slice(0, limit);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Heading numberOfLines={1} maxFontSizeMultiplier={1.3}>
                Activity
              </Heading>
              <View style={styles.monthRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  disabled={dateRange !== 'month'}
                  onPress={() => setMonth(shiftMonth(month, -1))}
                  hitSlop={8}
                  style={styles.monthBtn}>
                  <Ionicons name="chevron-back" size={18} color={dateRange === 'month' ? colors.text : colors.textMuted} />
                </Pressable>
                <Body numberOfLines={1} maxFontSizeMultiplier={1.25} style={styles.monthLabel}>
                  {monthLabel(month)}
                </Body>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  disabled={dateRange !== 'month'}
                  onPress={() => setMonth(shiftMonth(month, 1))}
                  hitSlop={8}
                  style={styles.monthBtn}>
                  <Ionicons name="chevron-forward" size={18} color={dateRange === 'month' ? colors.text : colors.textMuted} />
                </Pressable>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Export visible transactions"
                onPress={exportCsv}
                style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="download-outline" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
                onPress={() => router.push('/transaction/new')}
                style={[styles.iconBtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}>
                <Ionicons name="add" size={22} color={colors.background} />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search merchant, category, notes"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search transactions"
              returnKeyType="search"
              maxFontSizeMultiplier={1.35}
              style={[
                styles.search,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                  paddingRight: query ? 44 : 14,
                },
              ]}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
                style={styles.clearSearch}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={visible}
            keyExtractor={(item) => String(item.id)}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.filters}>
                <SegmentedControl
                  value={type}
                  onChange={setType}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Debit', value: 'debit' },
                    { label: 'Credit', value: 'credit' },
                  ]}
                />
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.scroller}
                  contentContainerStyle={styles.scrollContent}>
                  {DATE_FILTERS.map((item) => (
                    <Chip
                      key={item.value}
                      label={item.label}
                      active={dateRange === item.value}
                      onPress={() => setDateRange(item.value)}
                    />
                  ))}
                </ScrollView>
                <Muted maxFontSizeMultiplier={1.3}>Categories</Muted>
                <CategoryFilter includeAll value={category} onChange={setCategory} />
                {category !== 'all' ? (
                  <Muted numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    Showing {category}
                  </Muted>
                ) : null}
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.scroller}
                  contentContainerStyle={styles.scrollContent}>
                  {SORTS.map((item) => (
                    <Chip key={item.value} label={item.label} active={sort === item.value} onPress={() => setSort(item.value)} />
                  ))}
                </ScrollView>
                <Muted maxFontSizeMultiplier={1.3}>
                  {loadingRemote ? 'Updating…' : `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`}
                  {filterError ? ` · ${filterError}` : ''}
                </Muted>
              </View>
            }
            renderItem={({ item }) => (
              <TransactionRow
                item={item}
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: String(item.id) } })}
              />
            )}
            ListFooterComponent={
              filtered.length > limit ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLimit((value) => value + 20)}
                  style={styles.more}>
                  <Body style={{ color: colors.tint, fontWeight: '800' }}>Show more</Body>
                </Pressable>
              ) : undefined
            }
            ListEmptyComponent={
              loadingRemote ? (
                <EmptyState title="Updating" message="Applying the date filter." />
              ) : (
                <View>
                  <EmptyState
                    title="No matching transactions"
                    message="Try another search, category, or date. The + button adds a transaction."
                  />
                  {filtersActive ? (
                    <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.more}>
                      <Body style={{ color: colors.tint, fontWeight: '800' }}>Clear filters</Body>
                    </Pressable>
                  ) : null}
                </View>
              )
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  monthBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { flexShrink: 1, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  searchWrap: { marginBottom: 8 },
  search: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
  },
  clearSearch: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 24, flexGrow: 1 },
  filters: { gap: 10, paddingBottom: 8 },
  scroller: { flexGrow: 0 },
  scrollContent: { gap: 8, paddingRight: 8 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
