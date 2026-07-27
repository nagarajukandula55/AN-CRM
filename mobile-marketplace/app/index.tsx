import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

// Entry route: send the logged-in user into their active mode's route
// group, or to login if unauthenticated. Per mobile-app-ia.md.
export default function Index() {
  const { user, loading, activeMode } = useAuth();

  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  switch (activeMode) {
    case "provider":
      return <Redirect href="/(provider)" />;
    case "ops":
      return <Redirect href="/(ops)" />;
    case "customer":
    default:
      return <Redirect href="/(customer)" />;
  }
}
