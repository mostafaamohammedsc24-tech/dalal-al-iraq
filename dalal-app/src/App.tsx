import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigation } from "@/components/navigation";
import { CompareBar } from "@/components/compare-bar";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "@/pages/home";
import ListingsPage from "@/pages/listings";
import ListingDetailPage from "@/pages/listing-detail";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import AddListingPage from "@/pages/add-listing";
import EditListingPage from "@/pages/edit-listing";
import ProfilePage from "@/pages/profile";
import ChatPage from "@/pages/chat";
import AdminPage from "@/pages/admin";
import PrivacyPage from "@/pages/privacy";
import AboutPage from "@/pages/about";
import NotificationsPage from "@/pages/notifications";
import ComparePage from "@/pages/compare";
import OfficeDetailPage from "@/pages/office-detail";
import OfficeLoginPage from "@/pages/office-login";
import LawyerLoginPage from "@/pages/lawyer-login";
import ChangePasswordPage from "@/pages/change-password";
import OfficeDashboardPage from "@/pages/office-dashboard";
import OfficeNetworkPage from "@/pages/office-network";
import OfficeDealsPage from "@/pages/office-deals";
import OfficeWalletPage from "@/pages/office-wallet";
import LawyerDashboardPage from "@/pages/lawyer-dashboard";
import LawyerInspectionsPage from "@/pages/lawyer-inspections";
import LawyerContractsPage from "@/pages/lawyer-contracts";
import LawyerWalletPage from "@/pages/lawyer-wallet";
import NetworkNotificationsPage from "@/pages/network-notifications";
import InspectionReportPage from "@/pages/inspection-report";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Router() {
  return (
    <>
      <Navigation />
      <main className="pb-20 min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/listings" component={ListingsPage} />
          <Route path="/listings/:id/:slug?" component={ListingDetailPage} />
          <Route path="/compare" component={ComparePage} />
          <Route path="/offices/:id" component={OfficeDetailPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/add-listing" component={AddListingPage} />
          <Route path="/edit-listing/:id" component={EditListingPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/chat" component={ChatPage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/office/login" component={OfficeLoginPage} />
          <Route path="/lawyer/login" component={LawyerLoginPage} />
          <Route path="/change-password" component={ChangePasswordPage} />
          <Route path="/office" component={OfficeDashboardPage} />
          <Route path="/office/network" component={OfficeNetworkPage} />
          <Route path="/office/deals" component={OfficeDealsPage} />
          <Route path="/office/wallet" component={OfficeWalletPage} />
          <Route path="/lawyer" component={LawyerDashboardPage} />
          <Route path="/lawyer/inspections" component={LawyerInspectionsPage} />
          <Route path="/lawyer/contracts" component={LawyerContractsPage} />
          <Route path="/lawyer/wallet" component={LawyerWalletPage} />
          <Route path="/network-notifications-page" component={NetworkNotificationsPage} />
          <Route path="/inspection-report/:id" component={InspectionReportPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/about" component={AboutPage} />
          <Route>
            <div className="flex items-center justify-center h-64 text-gray-400">
              <div className="text-center">
                <p className="text-2xl font-bold mb-2">٤٠٤</p>
                <p>الصفحة غير موجودة</p>
              </div>
            </div>
          </Route>
        </Switch>
      </main>
      <CompareBar />
      <Toaster />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
