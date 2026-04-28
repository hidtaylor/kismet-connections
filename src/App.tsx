import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import ContactEditPage from "./pages/ContactEditPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import ScanCardPage from "./pages/ScanCardPage";
import VoiceNotePage from "./pages/VoiceNotePage";
import RecordMeetingPage from "./pages/RecordMeetingPage";
import CalendarReviewPage from "./pages/CalendarReviewPage";
import GmailImportPage from "./pages/GmailImportPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/contact/new" element={<ContactEditPage />} />
              <Route path="/contact/:id" element={<ContactDetailPage />} />
              <Route path="/contact/:id/edit" element={<ContactEditPage />} />
              <Route path="/capture/scan" element={<ScanCardPage />} />
              <Route path="/capture/voice" element={<VoiceNotePage />} />
              <Route path="/capture/meeting" element={<RecordMeetingPage />} />
              <Route path="/import/calendar" element={<CalendarReviewPage />} />
              <Route path="/import/gmail" element={<GmailImportPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
