import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { DASHBOARD_TABS, type DashboardTab } from "./superAdminDashboardApi";
import { humanize } from "./dashboardPresentation";

export function DashboardNavigation({
  activeTab,
  onSelect
}: {
  activeTab: DashboardTab;
  onSelect: (tab: DashboardTab, focusPanel: boolean) => void;
}) {
  const [focusIndex, setFocusIndex] = useState(() => DASHBOARD_TABS.indexOf(activeTab));
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => setFocusIndex(DASHBOARD_TABS.indexOf(activeTab)), [activeTab]);

  const focusTab = (index: number) => {
    const bounded = (index + DASHBOARD_TABS.length) % DASHBOARD_TABS.length;
    setFocusIndex(bounded);
    refs.current[bounded]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(DASHBOARD_TABS.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(DASHBOARD_TABS[index], true);
    }
  };

  return (
    <nav className="dashboard-navigation" aria-label="Dashboard sections">
      <label className="dashboard-navigation__select">
        <span>Dashboard section</span>
        <select
          value={activeTab}
          onChange={(event) => onSelect(event.target.value as DashboardTab, true)}
        >
          {DASHBOARD_TABS.map((tab) => <option key={tab} value={tab}>{humanize(tab)}</option>)}
        </select>
      </label>
      <div className="dashboard-navigation__tabs" role="tablist" aria-label="Dashboard sections">
        {DASHBOARD_TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(node) => { refs.current[index] = node; }}
            id={`dashboard-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`dashboard-panel-${tab}`}
            tabIndex={focusIndex === index ? 0 : -1}
            onClick={() => onSelect(tab, true)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {humanize(tab)}
          </button>
        ))}
      </div>
    </nav>
  );
}
