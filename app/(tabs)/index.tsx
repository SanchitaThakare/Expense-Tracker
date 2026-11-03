import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { Card } from '@/components/ui/Card';
import { DueTotalsRow } from '@/components/ui/DueTotals';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { TransactionRow } from '@/components/ui/TransactionRow';
import { Body, Heading, Muted, Title } from '@/components/ui/Typography';
import { useDues } from '@/context/DuesContext';
import { useFinance } from '@/context/FinanceContext';
import { useAppTheme } from '@/context/ThemeContext';
import { formatINR, monthLabel, shiftMonth, toISODate } from '@/lib/format';
import { periodBounds, spendingAnomalies, summarizePeriod, type ReportPeriod } from '@/lib/reports';

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, scheme, preference, setPreference } = useAppTheme();
  const { month, setMonth, summary, breakdown, trend, alerts, transactions, history, bills } = useFinance();
  const { totals: dueTotals } = useDues();
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const bounds = periodBounds(period, toISODate(), month);
  const periodSummary = summarizePeriod(history, bounds.from, bounds.to);
  const anomalies = spendingAnomalies(history, month);
  const upcoming = bills.filter((bill) => bill.nextDate <= toISODate());
  const chartWidth = Math.min(width - 72, 340);

  const pieData = useMemo(
    () =>
      breakdown.slice(0, 6).map((item) => ({
        value: item.amount,
        color: item.color,
        text: `${Math.round((item.amount / Math.max(summary.expenses, 1)) * 100)}%`,
      })),
    [breakdown, summary.expenses],
  );

  const barData = useMemo(
    () =>
      trend.map((item) => ({
        value: item.expenses,
        label: monthLabel(item.month).slice(0, 3),
        frontColor: colors.tint,
      })),
    [trend, colors.tint],
  );

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Muted>Personal finance</Muted>
            <Title>Dashboard</Title>
          </View>
          <Pressable
            onPress={() => setPreference(scheme === 'dark' ? 'light' : 'dark')}
            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name={scheme === 'dark' ? 'sunny' : 'moon'} size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonth(shiftMonth(month, -1))}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Heading>{monthLabel(month)}</Heading>
          <Pressable onPress={() => setMonth(shiftMonth(month, 1))}>
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.scope}>
          {(['day', 'week', 'month', 'year'] as ReportPeriod[]).map((item) => (
            <Pressable key={item} onPress={() => setPeriod(item)}>
              <Muted style={{ color: period === item ? colors.tint : colors.textMuted, fontWeight: '800' }}>
                {item}
              </Muted>
            </Pressable>
          ))}
        </View>

        <LinearGradient
          colors={scheme === 'dark' ? ['#134E4A', '#0F766E'] : ['#0F766E', '#0D9488']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <Muted style={{ color: 'rgba(255,255,255,0.8)' }}>
            Balance · {period} · transfers excluded
          </Muted>
          <Title style={{ color: '#fff', marginTop: 4 }}>{formatINR(periodSummary.balance)}</Title>
          <View style={styles.heroStats}>
            <View>
              <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>Income</Muted>
              <Body style={styles.heroValue}>{formatINR(periodSummary.income, true)}</Body>
            </View>
            <View>
              <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>Expenses</Muted>
              <Body style={styles.heroValue}>{formatINR(periodSummary.expenses, true)}</Body>
            </View>
            <View>
              <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>Dues</Muted>
              <Body style={styles.heroValue}>{formatINR(dueTotals.outstanding, true)}</Body>
            </View>
          </View>
        </LinearGradient>

        <Card>
          <View style={styles.sectionHead}>
            <Heading>Credit & dues</Heading>
            <Link href="/dues" style={{ color: colors.tint, fontWeight: '700' }}>
              Open
            </Link>
          </View>
          <View style={{ marginTop: 12 }}>
            <DueTotalsRow
              lent={dueTotals.lent}
              repaid={dueTotals.repaid}
              outstanding={dueTotals.outstanding}
            />
          </View>
          <Muted style={{ marginTop: 10 }}>
            They owe you {formatINR(dueTotals.outstanding, true)}
            {dueTotals.iOwe > 0 ? ` · You owe ${formatINR(dueTotals.iOwe, true)}` : ''}. Not included in income or expenses.
          </Muted>
        </Card>

        {anomalies.length ? (
          <Card>
            <Heading style={{ color: colors.warning }}>Spending check</Heading>
            {anomalies.map((item) => (
              <Body key={item.category} style={{ marginTop: 6 }}>{item.detail}</Body>
            ))}
          </Card>
        ) : null}

        {upcoming.length ? (
          <Card>
            <Heading>Due now</Heading>
            {upcoming.map((bill) => (
              <Body key={bill.id} style={{ marginTop: 6 }}>
                {bill.name} · {formatINR(bill.amount, true)} · {bill.nextDate}
              </Body>
            ))}
          </Card>
        ) : null}

        {alerts.length > 0 ? (
          <Card style={{ borderColor: colors.warning }}>
            <Heading style={{ color: colors.warning, marginBottom: 8 }}>Spending alerts</Heading>
            {alerts.map((alert) => (
              <Body key={alert.category} style={{ marginBottom: 4 }}>
                {alert.category}: {Math.round(alert.percent)}% of {formatINR(alert.limit, true)}
                {alert.level === 'over' ? ' — over budget' : ' — 80% reached'}
              </Body>
            ))}
          </Card>
        ) : null}

        <Card>
          <Heading style={{ marginBottom: 12 }}>Spending mix</Heading>
          {pieData.length ? (
            <View style={styles.chartRow}>
              <PieChart
                data={pieData}
                donut
                radius={80}
                innerRadius={52}
                innerCircleColor={colors.surface}
                centerLabelComponent={() => (
                  <Muted style={{ textAlign: 'center' }}>Spend</Muted>
                )}
              />
              <View style={{ flex: 1, gap: 8 }}>
                {breakdown.slice(0, 5).map((item) => (
                  <View key={item.category} style={styles.legend}>
                    <View style={[styles.swatch, { backgroundColor: item.color }]} />
                    <Muted style={{ flex: 1 }}>{item.category}</Muted>
                    <Muted>{formatINR(item.amount, true)}</Muted>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <EmptyState title="No expenses yet" message="Add a transaction or import a sample SMS to see charts." />
          )}
        </Card>

        <Card>
          <Heading style={{ marginBottom: 12 }}>Last 6 months</Heading>
          {barData.some((item) => item.value > 0) ? (
            <BarChart
              data={barData}
              barWidth={22}
              spacing={18}
              width={chartWidth}
              height={180}
              barBorderRadius={8}
              hideRules
              yAxisThickness={0}
              xAxisThickness={0}
              yAxisTextStyle={{ color: colors.textMuted }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 11 }}
              noOfSections={3}
              isAnimated
            />
          ) : (
            <EmptyState title="No trend yet" message="Spending over recent months will appear here." />
          )}
        </Card>

        <View style={styles.sectionHead}>
          <Heading>Recent activity</Heading>
          <Link href="/transactions" style={{ color: colors.tint, fontWeight: '700' }}>
            See all
          </Link>
        </View>
        <Card>
          {transactions.slice(0, 5).map((item) => (
            <TransactionRow
              key={item.id}
              item={item}
              onPress={() => router.push(`/transaction/${item.id}`)}
            />
          ))}
          {!transactions.length ? (
            <EmptyState title="No transactions" message="Use Activity to add one, or SMS Lab to parse samples." />
          ) : null}
        </Card>

        <Muted>Theme: {preference === 'system' ? `system (${scheme})` : preference}. Data stays on this device.</Muted>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  hero: { borderRadius: 24, padding: 20 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  heroValue: { color: '#fff', fontWeight: '800', fontSize: 16, marginTop: 4 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scope: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
});
