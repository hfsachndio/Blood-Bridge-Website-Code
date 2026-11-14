import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout, Gate } from "./components/Layout";
import { Toaster } from "./components/ui";
import Landing from "./pages/Landing";
import { Login, Signup, ForgotPassword } from "./pages/Auth";
import { ProfileSetup, Status } from "./pages/ProfileSetup";
import Home from "./pages/Home";
import { ChatList, Conversation } from "./pages/Chat";
import Leaderboard from "./pages/Leaderboard";
import Profile, { ProfileEdit } from "./pages/Profile";
import { Notifications, Requests } from "./pages/Activity";
import { History, LogDonation, Certificate } from "./pages/Donations";
import Eligibility from "./pages/Eligibility";
import BotPage from "./pages/BotPage";
import Admin from "./pages/Admin";

// Map pages load Leaflet, so they're split into their own chunk.
const Search = lazy(() => import("./pages/Search"));
const Donate = lazy(() => import("./pages/Donate"));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
const app = (el: ReactNode) => <Gate><AppLayout><Suspense fallback={<div className="p-10 text-center text-sm text-gray-500">Loading…</div>}>{el}</Suspense></AppLayout></Gate>;

function NotFound() {
  return <div className="grid min-h-screen place-items-center p-6 text-center"><div><div className="text-6xl font-extrabold text-brand-600">404</div><p className="mt-2 text-gray-600">This page doesn't exist.</p><Link to="/" className="btn-primary mt-6">Go home</Link></div></div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollTop />
      <Toaster />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/profile/setup" element={<ProfileSetup />} />
        <Route path="/status" element={<Status />} />
        <Route path="/admin" element={<Gate need="admin"><Admin /></Gate>} />
        <Route path="/app" element={app(<Home />)} />
        <Route path="/search" element={app(<Search />)} />
        <Route path="/chat" element={app(<ChatList />)} />
        <Route path="/chat/:id" element={app(<Conversation />)} />
        <Route path="/donate" element={app(<Donate />)} />
        <Route path="/leaderboard" element={app(<Leaderboard />)} />
        <Route path="/profile" element={app(<Profile />)} />
        <Route path="/profile/edit" element={app(<ProfileEdit />)} />
        <Route path="/notifications" element={app(<Notifications />)} />
        <Route path="/requests" element={app(<Requests />)} />
        <Route path="/history" element={app(<History />)} />
        <Route path="/log-donation" element={app(<LogDonation />)} />
        <Route path="/certificate/:id" element={app(<Certificate />)} />
        <Route path="/eligibility" element={app(<Eligibility />)} />
        <Route path="/bot" element={app(<BotPage />)} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
