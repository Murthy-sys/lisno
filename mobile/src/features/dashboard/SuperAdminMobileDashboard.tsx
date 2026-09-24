import { useEffect, useMemo, useState, type ReactNode } from "react";
import { router } from "expo-router";
import {
  AccessibilityInfo,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle
} from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { NavigationIcon } from "../../navigation/NavigationIcon";
import { useReducedMotion } from "../onboarding/useReducedMotion";
import {
  BudgetPositionChart,
  CostCompositionDonutChart,
  FinanceActivityChart,
  LifecycleDonutChart
} from "./charts";
import {
  AvailabilityBanner,
  DashboardSelector,
  DashboardSkeleton,
  DashboardValuesSheet,
  OperationsHeader,
  type DashboardSelectorItem
} from "./components";
import {
  formatDashboardPaise,
  useDashboardOverview,
  type DashboardDeliveryModuleView,
  type DashboardPeriod,
  type DashboardValueView,
  type DashboardViewModel
} from "./data";
import { isDashboardPeriod } from "./data/contract";
import {
  toBudgetPositionChartData,
  toCostCompositionDonutData,
  toFinanceActivityChartData,
  toLifecycleDonutData,
  toValueGroups
} from "./dashboardAdapters";
import {
  dashboardColors as color,
  dashboardLayout,
  dashboardRadii as radius,
  dashboardSpacing as space,
  dashboardSurfaceDepth,
  dashboardTypography as type
} from "./dashboardTheme";

type Accent = "sage" | "sand" | "blue" | "plum" | "danger";
type ProgressModuleId = "estimation" | "design" | "procurement" | "execution";

const MODULE_ITEMS: readonly DashboardSelectorItem<ProgressModuleId>[] = [
  { id: "estimation", label: "Estimation" },
  { id: "design", label: "Design" },
  { id: "procurement", label: "Procurement" },
  { id: "execution", label: "Execution" }
];

const ROLE_TONES = [color.sage, color.blue, color.plum, color.sand, color.unavailable] as const;

interface ExecutiveKpi {
  readonly id: string;
  readonly label: string;
  readonly value: DashboardValueView;
  readonly supporting: string;
  readonly accent: Accent;
  readonly glyph: string;
}

function requiredValue(values: readonly DashboardValueView[], id: string): DashboardValueView {
  const value = values.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Dashboard view model is missing ${id}.`);
  return value;
}

function deliveryModule(model: DashboardViewModel, id: ProgressModuleId): DashboardDeliveryModuleView {
  const module = model.delivery.find((candidate) => candidate.id === id);
  if (!module) throw new Error(`Dashboard view model is missing ${id}.`);
  return module;
}

export function buildExecutiveKpis(
  model: DashboardViewModel,
  comparisonEnabled: boolean
): readonly ExecutiveKpi[] {
  const projects = requiredValue(model.projectFacts.values, "projects.total");
  const overdue = requiredValue(model.projectFacts.values, "projects.liveOverdue");
  const projectsCreated = model.heroCountMetrics.find((metric) => metric.id === "projects_created")!;
  const projectComparison = comparisonEnabled
    ? projectsCreated.currentAvailable && projectsCreated.previousAvailable
      ? `${projectsCreated.currentDisplay} created · ${projectsCreated.deltaDisplay} (${projectsCreated.changeDisplay}) vs previous`
      : projectsCreated.currentAvailable
        ? `${projectsCreated.currentDisplay} created · previous period unavailable — ${projectsCreated.unavailableReason ?? "comparison source unavailable"}`
        : projectsCreated.unavailableReason ?? "Current period activity is not available."
    : `${projectsCreated.currentDisplay} created in the current window`;

  return [
    {
      id: "projects.total",
      label: "Total projects",
      value: projects,
      supporting: projectComparison,
      accent: "sage",
      glyph: "▦"
    },
    {
      id: "finance.approvedSubtotalPaise",
      label: "Approved net revenue",
      value: model.capital.approvedNetRevenue,
      supporting: "GST excluded · approved estimates",
      accent: "blue",
      glyph: "₹"
    },
    {
      id: "finance.approvedContractTotalPaise",
      label: "Approved contract value",
      value: model.capital.approvedContractTotal,
      supporting: "GST included · approved estimates",
      accent: "sand",
      glyph: "◇"
    },
    {
      id: "finance.currentMarginBps",
      label: "Current margin",
      value: model.capital.currentMargin,
      supporting: "Net revenue less recorded cost",
      accent: "plum",
      glyph: "%"
    },
    {
      id: "projects.liveOverdue",
      label: "Live overdue",
      value: overdue,
      supporting: overdue.available && overdue.value === 0
        ? "No live project is overdue"
        : "Current project deadlines",
      accent: overdue.available && (overdue.value ?? 0) > 0 ? "danger" : "sage",
      glyph: "!"
    }
  ];
}

function accentStyles(accent: Accent) {
  if (accent === "sand") return [styles.accentSand, styles.iconSand];
  if (accent === "blue") return [styles.accentBlue, styles.iconBlue];
  if (accent === "plum") return [styles.accentPlum, styles.iconPlum];
  if (accent === "danger") return [styles.accentDanger, styles.iconDanger];
  return [styles.accentSage, styles.iconSage];
}

function KpiCard({
  item,
  singleColumn
}: {
  readonly item: ExecutiveKpi;
  readonly singleColumn: boolean;
}) {
  const [accent, icon] = accentStyles(item.accent);
  return (
    <View
      accessibilityLabel={`${item.label}: ${item.value.displayValue}. ${item.value.available ? item.supporting : item.value.unavailableReason ?? "Not available"}`}
      style={[
        styles.kpiCard,
        singleColumn ? styles.kpiSingle : styles.kpiThird
      ]}
      testID={`dashboard-kpi-${item.id}`}
    >
      <View style={styles.kpiTopline}>
        <View accessibilityElementsHidden style={[styles.kpiIcon, icon]}>
          <Text allowFontScaling={false} style={[styles.kpiGlyph, accent]}>{item.glyph}</Text>
        </View>
        <Text style={styles.kpiLabel}>{item.label}</Text>
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.66}
        numberOfLines={item.value.available ? 2 : undefined}
        style={[styles.kpiValue, !item.value.available ? styles.unavailableValue : null]}
      >
        {item.value.displayValue}
      </Text>
      <Text style={[styles.kpiSupporting, !item.value.available ? styles.unavailableText : null]}>
        {item.value.available ? item.supporting
          : item.value.unavailableReason === "Authoritative data is unavailable for this metric."
            ? "Authoritative data is unavailable."
            : item.value.unavailableReason ?? "Authoritative source unavailable."}
      </Text>
    </View>
  );
}

function ProjectOverviewCard({ item, model, stacked }: {
  readonly item: ExecutiveKpi;
  readonly model: DashboardViewModel;
  readonly stacked: boolean;
}) {
  const points = model.trendByMetric.projects_created.points;
  // Six chronological groups cover the entire selected window; a missing day
  // leaves its group unavailable rather than turning missing data into zero.
  const bucketSize = Math.max(1, Math.ceil(points.length / 6));
  const groups = Array.from({ length: Math.ceil(points.length / bucketSize) }, (_, index) => {
    const group = points.slice(index * bucketSize, (index + 1) * bucketSize);
    return {
      id: group[0]!.id,
      label: `${group[0]!.currentDate} to ${group[group.length - 1]!.currentDate}`,
      value: group.some((point) => point.current === null) ? null : group.reduce((sum, point) => sum + point.current!, 0)
    };
  });
  const maximum = Math.max(1, ...groups.map((group) => group.value ?? 0));
  return (
    <View style={styles.projectCard} testID={`dashboard-kpi-${item.id}`}
      accessibilityLabel={`${item.label}: ${item.value.displayValue}. ${item.value.available ? item.supporting : item.value.unavailableReason}`}>
      <View style={[styles.projectMain, stacked ? styles.projectStacked : null]}>
        <View accessibilityElementsHidden style={[styles.projectIcon, styles.iconSage]}>
          <NavigationIcon name="projects" color={color.text} />
        </View>
        <View style={styles.projectCopy}>
          <Text style={styles.projectLabel}>{item.label}</Text>
          <Text style={styles.projectValue}>{item.value.displayValue}</Text>
        </View>
        <View style={styles.trendBlock} accessible accessibilityRole="image"
          accessibilityLabel={`New projects in the ${model.period}-day UTC window. ${groups.map((group) => `${group.label}: ${group.value ?? "Not available"}`).join(". ")}`}>
          <View style={styles.projectTrend} testID="dashboard-project-creation-trend">
            {groups.map((group, index) => (
              <View key={group.id} style={styles.trendColumn}>
                {group.value === null ? <Text style={styles.trendMissing}>?</Text> : (
                  <View testID={`dashboard-project-trend-${index}`} style={[styles.trendBar, {
                    height: group.value / maximum * 44,
                    backgroundColor: index === groups.length - 1 ? color.violet : "#d5e0d6"
                  }]} />
                )}
              </View>
            ))}
          </View>
          <Text style={styles.trendCaption}>New projects · {model.period}D</Text>
        </View>
      </View>
      <Text style={styles.projectSupporting}>{item.value.available ? item.supporting : item.value.unavailableReason}</Text>
    </View>
  );
}

function OverviewHeading({ title, onPress, actionLabel }: {
  readonly title: string;
  readonly onPress?: (() => void) | undefined;
  readonly actionLabel: string;
}) {
  return (
    <View style={styles.overviewHeading}>
      <Text accessibilityRole="header" style={styles.overviewTitle}>{title}</Text>
      {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onPress}
        style={({ pressed }) => [styles.overviewAction, pressed ? styles.pressed : null]}>
        <Text style={styles.overviewActionText}>View all</Text><Text accessibilityElementsHidden style={styles.overviewArrow}>→</Text>
      </Pressable> : null}
    </View>
  );
}

function ExecutivePanel({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  style,
  testID
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  return (
    <View style={[styles.panel, style]} testID={testID}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeading}>
          <Text style={styles.panelEyebrow}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text>
          {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
        </View>
        {action ? <View style={styles.panelAction}>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

function ExactRows({
  values,
  tones = []
}: {
  readonly values: readonly DashboardValueView[];
  readonly tones?: readonly string[];
}) {
  return (
    <View style={styles.exactRows}>
      {values.map((value, index) => (
        <View
          accessibilityLabel={`${value.label}: ${value.displayValue}${value.available ? "" : `. ${value.unavailableReason ?? "Authoritative source unavailable"}`}`}
          key={value.id}
          style={styles.exactRow}
        >
          <View style={[styles.exactMark, { backgroundColor: value.available ? tones[index] ?? color.sage : color.unavailable }]} />
          <View style={styles.exactCopy}>
            <Text style={styles.exactLabel}>{value.label}</Text>
            {!value.available ? <Text style={styles.exactReason}>{value.unavailableReason}</Text> : null}
          </View>
          <Text style={[styles.exactValue, !value.available ? styles.unavailableValue : null]}>{value.displayValue}</Text>
        </View>
      ))}
    </View>
  );
}

function chartCenterDisplay(
  values: readonly DashboardValueView[],
  completeDisplay: string
): string {
  return values.some((value) => !value.available) ? "Partial" : completeDisplay;
}

function ChartAvailabilityNote({ values }: { readonly values: readonly DashboardValueView[] }) {
  const unavailable = values.filter((value) => !value.available);
  if (unavailable.length === 0) return null;
  return (
    <View
      accessibilityLabel={`Partial chart. ${unavailable.map((value) => `${value.label}: ${value.unavailableReason ?? "Authoritative source unavailable"}`).join(". ")}`}
      style={styles.chartAvailability}
      testID="dashboard-chart-partial-note"
    >
      <Text style={styles.chartAvailabilityTitle}>PARTIAL VIEW</Text>
      {unavailable.map((value) => (
        <Text key={value.id} style={styles.chartAvailabilityText}>
          {value.label}: {value.unavailableReason ?? "Authoritative source unavailable"}
        </Text>
      ))}
    </View>
  );
}

function FinanceDayNavigator({
  point,
  position,
  total,
  onPrevious,
  onNext
}: {
  readonly point: ReturnType<typeof toFinanceActivityChartData>["points"][number] | null;
  readonly position: number;
  readonly total: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  const previousDisabled = position <= 0;
  const nextDisabled = total === 0 || position >= total - 1;
  return (
    <View
      accessibilityLabel={point
        ? `Selected UTC day ${point.date}, recorded cost activity ${point.displayValue}${point.available ? "" : `. ${point.unavailableReason ?? "Unavailable"}`}`
        : "No recorded cost activity day is available"}
      style={styles.dayNavigator}
      testID="dashboard-finance-day-navigator"
    >
      <Pressable
        accessibilityLabel="Previous finance day"
        accessibilityRole="button"
        accessibilityState={{ disabled: previousDisabled }}
        disabled={previousDisabled}
        onPress={onPrevious}
        style={({ pressed }) => [styles.dayStep, previousDisabled ? styles.controlDisabled : null, pressed ? styles.pressed : null]}
      >
        <Text accessibilityElementsHidden allowFontScaling={false} style={styles.dayStepText}>‹</Text>
      </Pressable>
      <View accessibilityLiveRegion="polite" style={styles.dayReadout}>
        <Text style={styles.dayLabel}>SELECTED UTC DAY</Text>
        <Text style={styles.dayDate}>{point?.date ?? "Not available"}</Text>
        <Text style={[styles.dayValue, !point?.available ? styles.unavailableValue : null]}>
          {point?.displayValue ?? "Not available"}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Next finance day"
        accessibilityRole="button"
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onNext}
        style={({ pressed }) => [styles.dayStep, nextDisabled ? styles.controlDisabled : null, pressed ? styles.pressed : null]}
      >
        <Text accessibilityElementsHidden allowFontScaling={false} style={styles.dayStepText}>›</Text>
      </Pressable>
    </View>
  );
}

function PriorityProject({
  model,
  canOpenProject
}: {
  readonly model: DashboardViewModel;
  readonly canOpenProject: boolean;
}) {
  const project = model.risk.topProjects[0];
  if (!model.risk.topProjectsAvailable) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Priority project is not available</Text>
        <Text style={styles.emptyDetail}>{model.risk.topProjectsUnavailableReason}</Text>
      </View>
    );
  }
  if (!project) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No project currently requires priority review</Text>
        <Text style={styles.emptyDetail}>The verified risk queue is empty for this snapshot.</Text>
      </View>
    );
  }
  const firstFactor = project.risk.factors[0];
  const openProject = () => {
    if (!canOpenProject) return;
    router.push({
      pathname: "/record/[featureId]/[recordId]",
      params: { featureId: "projects", recordId: project.projectId }
    });
  };
  return (
    <View style={styles.priorityBody}>
      <View style={styles.priorityVisual}>
        <View style={styles.priorityVisualCopy}>
          <Text style={styles.priorityVisualLabel}>PRIORITY REVIEW</Text>
          <Text style={styles.priorityVisualValue}>{project.risk.level.toUpperCase()} RISK</Text>
        </View>
      </View>
      <View style={styles.priorityCopy}>
        <Text style={styles.priorityStatus}>{project.projectStatus.replaceAll("_", " ").toUpperCase()}</Text>
        <Text style={styles.priorityName}>{project.projectName}</Text>
        <Text style={styles.priorityMeta}>{project.risk.factors.length} verified risk signal{project.risk.factors.length === 1 ? "" : "s"}</Text>
        {firstFactor ? <Text style={styles.priorityReason}>{firstFactor.reason}</Text> : null}
        {canOpenProject ? (
          <Pressable
            accessibilityLabel={`Open ${project.projectName}`}
            accessibilityRole="link"
            onPress={openProject}
            style={({ pressed }) => [styles.inlineAction, pressed ? styles.pressed : null]}
          >
            <Text style={styles.inlineActionText}>OPEN PROJECT</Text>
            <Text accessibilityElementsHidden style={styles.inlineActionArrow}>→</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ActionQueue({ model }: { readonly model: DashboardViewModel }) {
  const redRisk = model.risk.distribution.find((value) => value.id === "risk.red");
  const liveOverdue = requiredValue(model.projectFacts.values, "projects.liveOverdue");
  const queue = [
    ...(redRisk ? [redRisk] : []),
    liveOverdue,
    ...model.people.governanceQueue,
    requiredValue(model.capital.exceptions, "finance.overBudgetProjectCount"),
    requiredValue(model.capital.exceptions, "finance.overdueTaskCount"),
    requiredValue(model.people.workforce, "workforce.overCapacityWorkers")
  ];
  return (
    <View style={styles.queueList}>
      {queue.map((item) => {
        const needsAttention = item.available && (item.value ?? 0) > 0;
        return (
          <View key={item.id} style={styles.queueRow}>
            <View style={[styles.queueIndex, needsAttention ? styles.queueIndexAttention : null]}>
              <Text style={[styles.queueIndexText, needsAttention ? styles.queueIndexTextAttention : null]}>
                {item.available ? item.displayValue : "—"}
              </Text>
            </View>
            <View style={styles.queueCopy}>
              <Text style={styles.queueLabel}>{item.label}</Text>
              <Text style={[styles.queueState, !item.available ? styles.unavailableText : null]}>
                {item.available
                  ? needsAttention ? "Requires review in the current snapshot" : "No open item"
                  : item.unavailableReason ?? "Authoritative source unavailable"}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RateTrack({ value, accent = color.sage }: { readonly value: DashboardValueView; readonly accent?: string }) {
  const normalized = value.available && value.value !== null
    ? Math.min(100, Math.max(0, value.value / 100))
    : 0;
  return (
    <View style={styles.progressItem}>
      <View style={styles.progressTopline}>
        <Text style={styles.progressLabel}>{value.label}</Text>
        <Text style={[styles.progressValue, !value.available ? styles.unavailableValue : null]}>{value.displayValue}</Text>
      </View>
      {value.available ? (
        <View accessibilityLabel={`${value.label} ${value.displayValue}`} style={styles.progressTrack}>
          <View style={[styles.progressFill, { backgroundColor: accent, width: `${normalized}%` }]} />
        </View>
      ) : (
        <Text style={styles.progressReason}>{value.unavailableReason}</Text>
      )}
    </View>
  );
}

function ModuleProgress({
  model,
  selected,
  onSelect
}: {
  readonly model: DashboardViewModel;
  readonly selected: ProgressModuleId;
  readonly onSelect: (id: ProgressModuleId) => void;
}) {
  const estimation = deliveryModule(model, "estimation");
  const design = deliveryModule(model, "design");
  const procurement = deliveryModule(model, "procurement");
  const execution = deliveryModule(model, "execution");
  const awaitingClient = requiredValue(estimation.stages, "estimation.awaitingClient");
  const approvalRate = requiredValue(design.supportingValues, "design.approvalRate");
  const procurementProgress = requiredValue(procurement.supportingValues, "procurement.averageProgress");
  const executionProgress = requiredValue(execution.supportingValues, "execution.weightedProgress");
  const selectedModule = deliveryModule(model, selected);
  const selectedValues = [
    ...selectedModule.coverage,
    ...selectedModule.stages,
    ...selectedModule.supportingValues
  ];
  return (
    <View style={styles.moduleBody}>
      <View style={styles.moduleHighlights}>
        <View style={styles.countProgress}>
          <View style={styles.countProgressCopy}>
            <Text style={styles.progressLabel}>Estimate · awaiting client</Text>
            <Text style={styles.countProgressBasis}>Current workflow snapshot</Text>
          </View>
          <Text style={[styles.countProgressValue, !awaitingClient.available ? styles.unavailableValue : null]}>{awaitingClient.displayValue}</Text>
        </View>
        <RateTrack accent={color.plum} value={approvalRate} />
        <RateTrack accent={color.sand} value={procurementProgress} />
        <RateTrack accent={color.sage} value={executionProgress} />
      </View>
      <DashboardSelector
        accessibilityLabel="Module progress details"
        compact
        items={MODULE_ITEMS}
        onSelect={onSelect}
        selected={selected}
      />
      <View style={styles.moduleExactHeader}>
        <Text style={styles.moduleExactTitle}>{selectedModule.label} exact snapshot</Text>
        <Text style={styles.moduleExactMeta}>{selectedValues.length} authorized metrics</Text>
      </View>
      <ExactRows values={selectedValues} />
    </View>
  );
}

function WorkforceSummary({ model }: { readonly model: DashboardViewModel }) {
  const active = requiredValue(model.people.workforce, "workforce.activeWorkers");
  const assigned = requiredValue(model.people.workforce, "workforce.assignedWorkers");
  const unassigned = requiredValue(model.people.workforce, "workforce.unassignedWorkers");
  const averageKpi = requiredValue(model.people.workforce, "workforce.averageKpi");
  const eligible = requiredValue(model.people.workforce, "workforce.kpiEligibleWorkers");
  const unavailable = requiredValue(model.people.workforce, "workforce.kpiUnavailableWorkers");
  const maxRole = Math.max(
    1,
    ...model.people.roleDistribution
      .filter((role) => role.available && role.value !== null)
      .map((role) => role.value as number)
  );
  return (
    <View style={styles.workforceBody}>
      <View style={styles.workforceStats}>
        {[active, assigned, unassigned, averageKpi].map((value) => (
          <View key={value.id} style={styles.workforceStat}>
            <Text style={[styles.workforceValue, !value.available ? styles.unavailableValue : null]}>{value.displayValue}</Text>
            <Text style={styles.workforceLabel}>{value.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.kpiCoverage}>
        <Text style={styles.kpiCoverageTitle}>CALCULATED KPI COVERAGE</Text>
        <Text style={styles.kpiCoverageText}>{eligible.displayValue} eligible · {unavailable.displayValue} unavailable</Text>
      </View>
      <View style={styles.roleList}>
        {model.people.roleDistribution.map((role, index) => {
          const width = role.available && role.value !== null ? Math.max(4, (role.value / maxRole) * 100) : 0;
          return (
            <View key={role.id} style={styles.roleRow}>
              <View style={styles.roleTopline}>
                <Text style={styles.roleLabel}>{role.label}</Text>
                <Text style={[styles.roleValue, !role.available ? styles.unavailableValue : null]}>{role.displayValue}</Text>
              </View>
              {role.available ? (
                <View style={styles.roleTrack}>
                  <View style={[styles.roleFill, { backgroundColor: ROLE_TONES[index % ROLE_TONES.length] ?? color.unavailable, width: `${width}%` }]} />
                </View>
              ) : <Text style={styles.progressReason}>{role.unavailableReason}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DashboardFailure({ denied, onRetry }: { readonly denied: boolean; readonly onRetry: () => void }) {
  return (
    <View accessibilityLiveRegion={denied ? "polite" : "assertive"} style={styles.failure}>
      <View style={[styles.failureMark, denied ? styles.failureMarkDenied : null]} />
      <Text accessibilityRole="header" style={styles.failureTitle}>
        {denied ? "Dashboard access changed" : "Executive dashboard is unavailable"}
      </Text>
      <Text style={styles.failureMessage}>
        {denied
          ? "Your current session cannot read this organization dashboard."
          : "Lisno could not verify the dashboard response. Check the connection and try again."}
      </Text>
      {!denied ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.failureAction, pressed ? styles.pressed : null]}>
          <Text style={styles.failureActionText}>TRY AGAIN</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = 30;

export function SuperAdminMobileDashboard({ session }: { readonly session: AuthenticatedSession }) {
  const { width, fontScale } = useWindowDimensions();
  const [selectedPeriod, setPeriod] = useState<DashboardPeriod>(DEFAULT_DASHBOARD_PERIOD);
  // A period outside the selector (for example a retired 90-day value) falls back to 30 days.
  const period: DashboardPeriod = isDashboardPeriod(selectedPeriod) ? selectedPeriod : DEFAULT_DASHBOARD_PERIOD;
  // The previous-period comparison is always on; the header no longer offers a switch.
  const comparisonEnabled = true;
  const [selectedFinancePosition, setSelectedFinancePosition] = useState(0);
  const [selectedModule, setSelectedModule] = useState<ProgressModuleId>("estimation");
  const [valuesOpen, setValuesOpen] = useState(false);
  const [chartFailure, setChartFailure] = useState(false);
  const [chartRetryKey, setChartRetryKey] = useState(0);
  const reducedMotionPreference = useReducedMotion();
  const reducedMotion = reducedMotionPreference !== false;
  const authorized = canPerformOperation(session, "GET /admin/dashboard/overview");
  const canOpenProject = canPerformOperation(session, "GET /admin/projects")
    && canPerformOperation(session, "GET /admin/projects/:projectId");
  const canListProjects = canPerformOperation(session, "GET /admin/projects");
  const query = useDashboardOverview(session, period);
  const model = query.data;
  const tablet = width >= dashboardLayout.tabletBreakpoint;
  const singleColumnKpis = width < 390 || fontScale > 1.15;
  const greeting = `${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, ${session.user.name.trim().split(/\s+/)[0] || "welcome"}`;

  const financeData = useMemo(() => model ? toFinanceActivityChartData(model) : null, [model]);
  const lifecycleData = useMemo(() => model ? toLifecycleDonutData(model) : [], [model]);
  const costComposition = useMemo(() => model ? toCostCompositionDonutData(model) : [], [model]);
  const budgetData = useMemo(() => model ? toBudgetPositionChartData(model) : null, [model]);
  const valueGroups = useMemo(() => model ? toValueGroups(model) : [], [model]);
  const kpis = useMemo(() => model ? buildExecutiveKpis(model, comparisonEnabled) : [], [comparisonEnabled, model]);

  const financePoints = financeData?.points ?? [];
  const safeFinancePosition = Math.min(
    Math.max(0, selectedFinancePosition),
    Math.max(0, financePoints.length - 1)
  );
  const selectedFinancePoint = financePoints[safeFinancePosition] ?? null;
  useEffect(() => {
    setSelectedFinancePosition(Math.max(0, financePoints.length - 1));
  }, [period, financePoints.length]);

  const rangeLabel = model
    ? `Current ${model.range.currentLabel}${comparisonEnabled ? ` · Previous ${model.range.previousLabel}` : ""}${model.range.partialFinalDay ? " · final day is partial" : ""}`
    : "UTC reporting window";

  const selectFinancePosition = (position: number) => {
    const bounded = Math.min(Math.max(0, position), Math.max(0, financePoints.length - 1));
    setSelectedFinancePosition(bounded);
    const point = financePoints[bounded];
    if (point) AccessibilityInfo.announceForAccessibility(`${point.date} UTC. Recorded cost activity ${point.displayValue}.`);
  };
  const onPeriodChange = (next: DashboardPeriod) => {
    setPeriod(next);
    AccessibilityInfo.announceForAccessibility(`Loading ${next} day dashboard.`);
  };
  const onRefresh = async () => {
    const result = await query.refetch();
    AccessibilityInfo.announceForAccessibility(result.isSuccess ? "Dashboard refreshed." : "Dashboard refresh failed.");
  };
  const retryCharts = () => {
    setChartFailure(false);
    setChartRetryKey((current) => current + 1);
  };

  if (!authorized) return <View style={styles.root}><DashboardFailure denied onRetry={() => undefined} /></View>;
  if (query.isPending && !model) {
    return <View style={styles.root}><View style={styles.loadingContent}><DashboardSkeleton /></View></View>;
  }
  if (query.isError && !model) {
    const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
    return <View style={styles.root}><DashboardFailure denied={denied} onRetry={() => void query.refetch()} /></View>;
  }
  if (!model || !financeData || !budgetData) {
    return <View style={styles.root}><DashboardFailure denied={false} onRetry={() => void query.refetch()} /></View>;
  }

  const budgetRemaining = model.capital.remainingBudget;
  const budgetStatus = !model.capital.costBudget.available || !budgetRemaining.available
    ? "Budget position is not available"
    : model.capital.costBudget.value === 0
      ? "Verified zero cost budget · utilization is not calculated"
      : (budgetRemaining.value ?? 0) < 0
        ? `Overspent by ${formatDashboardPaise(Math.abs(budgetRemaining.value ?? 0))}`
        : `${budgetRemaining.displayValue} remaining`;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: space.md }
        ]}
        refreshControl={(
          <RefreshControl
            colors={[color.violet]}
            onRefresh={() => void onRefresh()}
            progressBackgroundColor={color.stage}
            refreshing={query.isRefetching && !query.isPlaceholderData}
            tintColor={color.violet}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <OperationsHeader
          greeting={greeting}
          onPeriodChange={onPeriodChange}
          period={period}
        />

        {query.isPlaceholderData ? (
          <AvailabilityBanner title={`Loading the ${period}-day view`} message="The last verified period remains visible until the new response is validated." />
        ) : null}
        {query.isError && model ? (
          <AvailabilityBanner title="Refresh did not complete" message="The last verified dashboard remains visible. Pull down to retry." tone="unavailable" />
        ) : null}
        {model.dataQuality.status === "partial" ? (
          <AvailabilityBanner title="Partial coverage" message={model.dataQuality.summary} actionLabel="View details" onAction={() => setValuesOpen(true)} />
        ) : null}
        {model.isAllZero ? (
          <AvailabilityBanner title="No recorded activity in this view" message="Verified sources returned zero. Lisno has not substituted demo values." />
        ) : null}
        {chartFailure ? (
          <View style={styles.chartFailureRow}>
            <AvailabilityBanner title="Charts are temporarily unavailable" message="Every verified value remains available below and in the exact data ledger." tone="unavailable" />
            <Pressable accessibilityRole="button" onPress={retryCharts} style={({ pressed }) => [styles.retryGraphic, pressed ? styles.pressed : null]}>
              <Text style={styles.retryGraphicText}>RETRY CHARTS</Text>
            </Pressable>
          </View>
        ) : null}

        <View accessibilityLabel="Executive key performance indicators" style={styles.overviewSections} testID="dashboard-kpi-grid">
          <View style={styles.overviewSection}>
            <OverviewHeading title="Project overview" actionLabel="View all projects"
              onPress={canListProjects ? () => router.push("/feature/projects") : undefined} />
            <ProjectOverviewCard item={kpis[0]!} model={model} stacked={fontScale > 1.3} />
          </View>
          <View style={styles.overviewSection}>
            <OverviewHeading title="Financial overview" actionLabel="View all financial values" onPress={() => setValuesOpen(true)} />
            <View style={styles.kpiGrid}>
              {kpis.slice(1, 4).map((item) => <KpiCard key={item.id} item={item} singleColumn={singleColumnKpis} />)}
            </View>
          </View>
          <View style={styles.overdueRow} testID="dashboard-kpi-projects.liveOverdue"
            accessibilityLabel={`Live overdue: ${kpis[4]!.value.displayValue}. ${kpis[4]!.value.available ? kpis[4]!.supporting : kpis[4]!.value.unavailableReason}`}>
            <View style={[styles.kpiIcon, kpis[4]!.accent === "danger" ? styles.iconDanger : styles.iconSage]}>
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.overdueCount}>{kpis[4]!.value.available ? kpis[4]!.value.displayValue : "!"}</Text>
            </View>
            <View style={styles.projectCopy}>
              <Text style={styles.projectLabel}>Live overdue</Text>
              <Text style={styles.kpiSupporting}>{kpis[4]!.value.available ? kpis[4]!.supporting : kpis[4]!.value.unavailableReason}</Text>
            </View>
          </View>
        </View>

        <ExecutivePanel
          eyebrow="FINANCE ACTIVITY"
          title="Recorded cost activity"
          subtitle="Daily posted ledger cost for the selected UTC window. Approved snapshot values are listed below."
          testID="dashboard-finance-panel"
        >
          <FinanceActivityChart
            data={financeData}
            selectedDayId={selectedFinancePoint?.id}
            height={tablet ? 290 : 258}
            onRenderError={() => setChartFailure(true)}
            onSelectDay={(id) => {
              const position = financePoints.findIndex((point) => point.id === id);
              if (position >= 0) selectFinancePosition(position);
            }}
            reducedMotion={reducedMotion}
            retryKey={chartRetryKey}
          />
          <FinanceDayNavigator
            onNext={() => selectFinancePosition(safeFinancePosition + 1)}
            onPrevious={() => selectFinancePosition(safeFinancePosition - 1)}
            point={selectedFinancePoint}
            position={safeFinancePosition}
            total={financePoints.length}
          />
          <ExactRows values={[model.capital.approvedNetRevenue, model.capital.costBudget]} tones={[color.blue, color.sand]} />
        </ExecutivePanel>

        <ExecutivePanel
          eyebrow="PROJECT PORTFOLIO"
          title="Project status"
          subtitle="Current project counts by lifecycle state."
          testID="dashboard-project-status-panel"
        >
          <View style={styles.referenceChartBody}><LifecycleDonutChart
            centerDisplay={chartCenterDisplay(
              model.lifecycle,
              requiredValue(model.projectFacts.values, "projects.total").displayValue
            )}
            onRenderError={() => setChartFailure(true)}
            reducedMotion={reducedMotion}
            retryKey={chartRetryKey}
            values={lifecycleData}
          /></View>
          <ChartAvailabilityNote values={model.lifecycle} />
        </ExecutivePanel>

        <View style={[styles.splitRow, tablet ? styles.splitRowTablet : null]}>
          <ExecutivePanel
            eyebrow="PRIORITY"
            style={styles.splitPanel}
            title="Priority project"
            subtitle="Highest verified portfolio risk in this snapshot."
            testID="dashboard-priority-panel"
          >
            <PriorityProject canOpenProject={canOpenProject} model={model} />
          </ExecutivePanel>
          <ExecutivePanel
            eyebrow="CURRENT QUEUES"
            style={styles.splitPanel}
            title="Action queue"
            subtitle="Open risk, delivery, governance, finance and capacity attention counts. This is not a chronological activity feed."
            testID="dashboard-action-queue-panel"
          >
            <ActionQueue model={model} />
          </ExecutivePanel>
        </View>

        <View style={[styles.splitRow, tablet ? styles.splitRowTablet : null]}>
          <ExecutivePanel
            eyebrow="RECORDED COST"
            style={styles.splitPanel}
            title="Cost composition"
            subtitle="Exact ledger classifications; unavailable sources remain separate from zero."
            testID="dashboard-cost-composition-panel"
          >
            <View style={styles.referenceChartBody}><CostCompositionDonutChart
              centerDisplay={chartCenterDisplay(
                model.capital.costComposition,
                model.capital.recordedCost.displayValue
              )}
              onRenderError={() => setChartFailure(true)}
              reducedMotion={reducedMotion}
              retryKey={chartRetryKey}
              values={costComposition}
            /></View>
            <ChartAvailabilityNote values={model.capital.costComposition} />
          </ExecutivePanel>
          <ExecutivePanel
            eyebrow="APPROVED PLAN"
            style={styles.splitPanel}
            title="Budget position"
            subtitle="Approved cost budget compared with classified recorded cost."
            testID="dashboard-budget-position-panel"
          >
            <BudgetPositionChart
              data={budgetData}
              onRenderError={() => setChartFailure(true)}
              reducedMotion={reducedMotion}
              retryKey={chartRetryKey}
            />
            <View style={[styles.budgetStatus, (budgetRemaining.value ?? 0) < 0 ? styles.budgetStatusDanger : null]}>
              <Text style={[styles.budgetStatusText, (budgetRemaining.value ?? 0) < 0 ? styles.budgetStatusDangerText : null]}>{budgetStatus}</Text>
            </View>
            <ExactRows values={[model.capital.costBudget, model.capital.recordedCost, model.capital.remainingBudget]} tones={[color.sand, color.sage, color.unavailable]} />
          </ExecutivePanel>
        </View>

        <ExecutivePanel
          eyebrow="DELIVERY"
          title="Module progress"
          subtitle="Aggregate workflow snapshots. Counts and percentages keep their own units."
          testID="dashboard-module-progress-panel"
        >
          <ModuleProgress model={model} onSelect={setSelectedModule} selected={selectedModule} />
        </ExecutivePanel>

        <ExecutivePanel
          eyebrow="WORKFORCE"
          title="Workforce summary"
          subtitle="Organization totals and aggregate role distribution; rows do not represent individual people or a ranking."
          testID="dashboard-workforce-panel"
        >
          <WorkforceSummary model={model} />
        </ExecutivePanel>

        <Pressable
          accessibilityHint="Opens every dashboard metric as native text with its unit and time basis."
          accessibilityLabel="Show all verified values"
          accessibilityRole="button"
          onPress={() => setValuesOpen(true)}
          style={({ pressed }) => [styles.ledgerAction, pressed ? styles.ledgerActionPressed : null]}
        >
          <View accessibilityElementsHidden style={styles.ledgerMark}>
            <View style={styles.ledgerMarkLine} />
            <View style={[styles.ledgerMarkLine, styles.ledgerMarkLineShort]} />
            <View style={styles.ledgerMarkLine} />
          </View>
          <View style={styles.ledgerCopy}>
            <Text style={styles.ledgerEyebrow}>EXACT DATA & QUALITY</Text>
            <Text style={styles.ledgerTitle}>Show all verified values</Text>
            <Text style={styles.ledgerDetail}>{valueGroups.length} groups · units, dates and availability included</Text>
          </View>
          <Text accessibilityElementsHidden style={styles.ledgerArrow}>→</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          Financial amounts follow approved-estimate and ledger lineage. Snapshot guides are context, workflow panels are current aggregates, and no forecast, activity event, project image, vendor ranking or employee ranking is generated.
        </Text>
      </ScrollView>

      <DashboardValuesSheet
        groups={valueGroups}
        observedLabel={`Observed ${model.range.observedLabel}`}
        onRequestClose={() => setValuesOpen(false)}
        rangeLabel={rangeLabel}
        visible={valuesOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  content: {
    width: "100%",
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: "center",
    gap: 10,
    paddingBottom: 72
  },
  loadingContent: { flex: 1, width: "100%", maxWidth: dashboardLayout.maxWidth, alignSelf: "center", paddingHorizontal: space.lg },
  overviewSections: { gap: 12 },
  overviewSection: { gap: 4 },
  overviewHeading: { minHeight: 38, flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8 },
  overviewTitle: { flex: 1, minWidth: 180, fontFamily: type.display, fontSize: 21, lineHeight: 28, color: color.text },
  overviewAction: { minHeight: 48, marginVertical: -5, flexDirection: "row", alignItems: "center", gap: 8 },
  overviewActionText: { fontFamily: type.regular, fontSize: 12, color: color.text },
  overviewArrow: { fontSize: 20, color: color.text },
  projectCard: { ...dashboardSurfaceDepth, padding: 14, gap: 5, borderRadius: radius.surface, borderWidth: 1, borderColor: color.stageEdge, backgroundColor: color.stage },
  projectMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  projectStacked: { flexWrap: "wrap" },
  projectIcon: { width: 48, height: 48, borderRadius: radius.control, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  projectCopy: { flex: 1, minWidth: 80 },
  projectLabel: { color: color.text, fontFamily: type.regular, fontSize: 13, lineHeight: 20 },
  projectValue: { color: color.text, fontFamily: type.medium, fontSize: 36, lineHeight: 46 },
  projectSupporting: { fontFamily: type.regular, color: color.textMuted, fontSize: 11, lineHeight: 17 },
  trendBlock: { width: 102, gap: 3 },
  projectTrend: { height: 46, flexDirection: "row", alignItems: "flex-end", gap: 5 },
  trendColumn: { flex: 1, height: 46, justifyContent: "flex-end", borderBottomWidth: 1, borderBottomColor: color.stageEdge },
  trendBar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  trendMissing: { color: color.textMuted, fontFamily: type.regular, fontSize: 12, textAlign: "center" },
  trendCaption: { color: color.textMuted, fontFamily: type.regular, fontSize: 10, textAlign: "right" },
  overdueRow: { padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.surface, borderWidth: 1, borderColor: color.stageEdge, backgroundColor: color.stage },
  overdueCount: { color: color.text, fontFamily: type.medium, fontSize: 16 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 7 },
  kpiCard: {
    ...dashboardSurfaceDepth,
    minWidth: 0,
    minHeight: 158,
    overflow: "hidden",
    gap: 7,
    padding: 12,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  kpiThird: { flexBasis: "30%", flexGrow: 1 },
  kpiSingle: { flexBasis: "100%", flexGrow: 1 },
  accentSage: { backgroundColor: color.sageSoft, color: color.violetBright },
  accentSand: { backgroundColor: color.sandSoft, color: color.warning },
  accentBlue: { backgroundColor: color.blueSoft, color: color.text },
  accentPlum: { backgroundColor: color.plumSoft, color: color.text },
  accentDanger: { backgroundColor: color.dangerSoft, color: color.dangerInk },
  iconSage: { backgroundColor: color.sageSoft },
  iconSand: { backgroundColor: color.sandSoft },
  iconBlue: { backgroundColor: color.blueSoft },
  iconPlum: { backgroundColor: color.plumSoft },
  iconDanger: { backgroundColor: color.dangerSoft },
  kpiTopline: { alignItems: "flex-start", gap: 7 },
  kpiIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  kpiGlyph: { fontFamily: type.semibold, fontSize: 15 },
  kpiLabel: { minWidth: 0, minHeight: 34, color: color.textMuted, fontSize: 12, lineHeight: 17, fontFamily: type.regular },
  kpiValue: { color: color.text, fontFamily: type.semibold, fontSize: 14, lineHeight: 20 },
  kpiSupporting: { color: color.textDim, fontFamily: type.regular, fontSize: 11, lineHeight: 16 },
  panel: {
    minWidth: 0,
    overflow: "hidden",
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  panelHeader: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: 18, paddingBottom: 8 },
  panelHeading: { flex: 1, minWidth: 0, gap: 3 },
  panelEyebrow: { color: color.warning, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  panelTitle: { color: color.text, fontFamily: type.display, fontSize: 23, lineHeight: 30 },
  panelSubtitle: { color: color.textMuted, ...type.body },
  panelAction: { alignItems: "flex-end" },
  referenceChartBody: { paddingHorizontal: 18, paddingBottom: 16 },
  splitRow: { gap: space.scene },
  splitRowTablet: { flexDirection: "row", alignItems: "flex-start" },
  splitPanel: { flex: 1 },
  exactRows: { paddingHorizontal: 18, paddingBottom: 16 },
  exactRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.stageLine
  },
  exactMark: { width: 7, height: 7, borderRadius: 4 },
  exactCopy: { flex: 1, minWidth: 0, paddingVertical: 7 },
  exactLabel: { color: color.textMuted, ...type.body },
  exactReason: { color: color.textMuted, ...type.metadata },
  exactValue: { maxWidth: "42%", flexShrink: 1, color: color.text, ...type.body, fontFamily: type.semibold, textAlign: "right" },
  unavailableValue: { color: color.textMuted },
  unavailableText: { color: color.textMuted },
  chartAvailability: { gap: 3, marginHorizontal: 18, marginBottom: 10, padding: 10, borderRadius: radius.control, backgroundColor: color.goldSoft },
  chartAvailabilityTitle: { color: color.warning, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  chartAvailabilityText: { color: color.textMuted, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  dayNavigator: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.stageLine
  },
  dayStep: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stageRaised
  },
  controlDisabled: { opacity: 0.36 },
  dayStepText: { color: color.text, fontFamily: type.medium, fontSize: 24, lineHeight: 27 },
  dayReadout: { flex: 1, minWidth: 0, alignItems: "center", gap: 1 },
  dayLabel: { color: color.textDim, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  dayDate: { color: color.textMuted, ...type.metadata, fontFamily: type.medium },
  dayValue: { color: color.text, ...type.cardTitle, textAlign: "center" },
  priorityBody: { padding: 18, paddingTop: 8, gap: 16 },
  priorityVisual: {
    minHeight: 116,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 16,
    borderRadius: radius.surface,
    backgroundColor: color.sageSoft
  },
  priorityVisualCopy: { gap: 3 },
  priorityVisualLabel: { color: color.violetBright, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  priorityVisualValue: { color: color.text, ...type.sectionTitle },
  priorityCopy: { gap: 6 },
  priorityStatus: { color: color.warning, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  priorityName: { color: color.text, ...type.sectionTitle },
  priorityMeta: { color: color.textMuted, fontFamily: type.medium, fontSize: 12, lineHeight: 18 },
  priorityReason: { color: color.textMuted, ...type.body },
  inlineAction: { minHeight: 48, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.control, borderWidth: 1, borderColor: color.violet },
  inlineActionText: { color: color.violetBright, ...type.button },
  inlineActionArrow: { color: color.violetBright, fontFamily: type.medium, fontSize: 16 },
  emptyState: { minHeight: 176, justifyContent: "center", gap: 7, padding: 20, margin: 18, marginTop: 8, borderRadius: radius.surface, backgroundColor: color.stageRaised },
  emptyTitle: { color: color.text, ...type.cardTitle },
  emptyDetail: { color: color.textMuted, ...type.body },
  queueList: { paddingHorizontal: 18, paddingBottom: 14 },
  queueRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.stageLine },
  queueIndex: { minWidth: 38, minHeight: 30, alignItems: "center", justifyContent: "center", paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.control, backgroundColor: color.stageRaised },
  queueIndexAttention: { backgroundColor: color.goldSoft },
  queueIndexText: { color: color.textMuted, fontFamily: type.semibold, fontSize: 12, lineHeight: 18 },
  queueIndexTextAttention: { color: color.warning },
  queueCopy: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 8 },
  queueLabel: { color: color.text, ...type.body, fontFamily: type.medium },
  queueState: { color: color.textDim, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  budgetStatus: { marginHorizontal: 18, marginBottom: 10, padding: 11, borderRadius: radius.control, backgroundColor: color.sageSoft },
  budgetStatusDanger: { backgroundColor: color.dangerSoft },
  budgetStatusText: { color: color.violetBright, fontFamily: type.medium, fontSize: 12, lineHeight: 18 },
  budgetStatusDangerText: { color: color.dangerInk },
  moduleBody: { gap: 16, paddingTop: 8, paddingBottom: 16 },
  moduleHighlights: { gap: 15, paddingHorizontal: 18 },
  countProgress: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: 12, backgroundColor: color.sageSoft },
  countProgressCopy: { flex: 1, minWidth: 0 },
  countProgressBasis: { color: color.textDim, fontFamily: type.regular, fontSize: 12, lineHeight: 18, marginTop: 2 },
  countProgressValue: { maxWidth: "40%", color: color.violetBright, ...type.sectionTitle, textAlign: "right" },
  progressItem: { gap: 6 },
  progressTopline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  progressLabel: { flex: 1, color: color.textMuted, ...type.body, fontFamily: type.medium },
  progressValue: { maxWidth: "40%", color: color.text, ...type.body, fontFamily: type.semibold },
  progressTrack: { height: 7, overflow: "hidden", borderRadius: 4, backgroundColor: color.canvasDeep },
  progressFill: { height: "100%", borderRadius: 4 },
  progressReason: { color: color.textMuted, ...type.metadata },
  moduleExactHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingHorizontal: 18 },
  moduleExactTitle: { flexShrink: 1, color: color.text, ...type.cardTitle },
  moduleExactMeta: { color: color.textDim, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  workforceBody: { padding: 18, paddingTop: 8, gap: 17 },
  workforceStats: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  workforceStat: { minWidth: 112, flexGrow: 1, flexBasis: "45%", gap: 2, padding: 12, borderRadius: 12, backgroundColor: color.stageRaised },
  workforceValue: { color: color.text, ...type.sectionTitle },
  workforceLabel: { color: color.textMuted, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  kpiCoverage: { gap: 3, paddingVertical: 11, paddingHorizontal: 13, borderRadius: radius.control, backgroundColor: color.plumSoft },
  kpiCoverageTitle: { color: color.text, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  kpiCoverageText: { color: color.textMuted, fontFamily: type.medium, fontSize: 12, lineHeight: 18 },
  roleList: { gap: 11 },
  roleRow: { gap: 5 },
  roleTopline: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  roleLabel: { flex: 1, color: color.textMuted, ...type.body },
  roleValue: { maxWidth: "40%", color: color.text, ...type.body, fontFamily: type.semibold },
  roleTrack: { height: 6, overflow: "hidden", borderRadius: 3, backgroundColor: color.canvasDeep },
  roleFill: { height: "100%", borderRadius: 3 },
  chartFailureRow: { gap: space.sm },
  retryGraphic: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.control, borderWidth: 1, borderColor: color.stageEdge, backgroundColor: color.stage },
  retryGraphicText: { color: color.violetBright, ...type.button },
  ledgerAction: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.surface, borderWidth: 1, borderColor: color.stageEdge, backgroundColor: color.stage },
  ledgerActionPressed: { borderColor: color.violet, backgroundColor: color.sageSoft },
  ledgerMark: { width: 42, height: 42, justifyContent: "center", gap: 5, paddingHorizontal: 10, borderRadius: radius.control, backgroundColor: color.sageSoft },
  ledgerMarkLine: { height: 2, borderRadius: 1, backgroundColor: color.violetBright },
  ledgerMarkLineShort: { width: "64%" },
  ledgerCopy: { flex: 1, minWidth: 0, gap: 2 },
  ledgerEyebrow: { color: color.warning, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  ledgerTitle: { color: color.text, ...type.cardTitle },
  ledgerDetail: { color: color.textMuted, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  ledgerArrow: { color: color.violetBright, fontFamily: type.medium, fontSize: 19 },
  disclaimer: { color: color.textDim, fontFamily: type.regular, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  failure: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.md, paddingHorizontal: space.xxl, backgroundColor: color.canvas },
  failureMark: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.warning },
  failureMarkDenied: { backgroundColor: color.unavailable },
  failureTitle: { color: color.text, ...type.pageTitle, textAlign: "center" },
  failureMessage: { maxWidth: 420, color: color.textMuted, ...type.body, textAlign: "center" },
  failureAction: { minHeight: 48, justifyContent: "center", paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.control, backgroundColor: color.violet },
  failureActionText: { color: color.primaryInk, ...type.button },
  pressed: { opacity: 0.72 }
});
