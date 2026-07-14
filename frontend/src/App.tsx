import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ErrorState } from "./components/common/ErrorState";
import { LoadingState } from "./components/common/LoadingState";
import { AppLayout } from "./components/layout/AppLayout";
import { IssueAttachmentManifestProvider } from "./contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "./contexts/NetaReportManifestContext";
import { useDashboardData } from "./hooks/useDashboardData";
import { DataQualityPage } from "./pages/DataQualityPage";
import { EquipmentPage } from "./pages/EquipmentPage";
import { EpsTestExecutionPage } from "./pages/EpsTestExecutionPage";
import { IssuesPage } from "./pages/IssuesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PdmPage } from "./pages/PdmPage";
import { PowerPlanPage } from "./pages/PowerPlanPage";

function App() {
  const dashboardData = useDashboardData();
  const location = useLocation();
  const needsDetailData =
    location.pathname === "/equipment" ||
    location.pathname === "/issues" ||
    location.pathname === "/power-plan" ||
    location.pathname === "/data-quality";
  const {
    detailDataLoaded,
    detailDataLoading,
    error,
    loadDetailData,
    loading,
  } = dashboardData;

  useEffect(() => {
    if (
      needsDetailData &&
      !loading &&
      !error &&
      !detailDataLoaded &&
      !detailDataLoading
    ) {
      void loadDetailData();
    }
  }, [detailDataLoaded, detailDataLoading, error, loadDetailData, loading, needsDetailData]);

  return (
    <IssueAttachmentManifestProvider manifest={dashboardData.issueAttachmentManifest}>
      <NetaReportManifestProvider manifest={dashboardData.netaReportManifest}>
        <AppLayout etlRunMetadata={dashboardData.etlRunMetadata}>
          {dashboardData.loading ||
          (needsDetailData && !dashboardData.detailDataLoaded && !dashboardData.detailDataError) ? (
            <LoadingState />
          ) : dashboardData.error ? (
            <ErrorState message={dashboardData.error} onRetry={dashboardData.reload} />
          ) : needsDetailData && dashboardData.detailDataError ? (
            <ErrorState message={dashboardData.detailDataError} onRetry={dashboardData.loadDetailData} />
          ) : (
            <Routes>
              <Route element={<Navigate replace to="/overview" />} path="/" />
              <Route element={<OverviewPage data={dashboardData} />} path="/overview" />
              <Route element={<PdmPage data={dashboardData} />} path="/pdms" />
              <Route element={<EquipmentPage data={dashboardData} />} path="/equipment" />
              <Route element={<IssuesPage data={dashboardData} />} path="/issues" />
              <Route element={<EpsTestExecutionPage data={dashboardData} />} path="/eps-test-execution" />
              <Route element={<PowerPlanPage data={dashboardData} />} path="/power-plan" />
              <Route element={<DataQualityPage data={dashboardData} />} path="/data-quality" />
              <Route element={<Navigate replace to="/overview" />} path="*" />
            </Routes>
          )}
        </AppLayout>
      </NetaReportManifestProvider>
    </IssueAttachmentManifestProvider>
  );
}

export default App;
