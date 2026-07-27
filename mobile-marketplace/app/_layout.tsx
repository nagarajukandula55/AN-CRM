import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/context/AuthContext";
import { RegionThemeProvider } from "../src/context/RegionThemeContext";

// Root layout: shared auth + region/theme resolution for every mode.
// Per-mode route groups ((customer)/(provider)/(ops)) each read
// useAuth().activeMode to decide whether to render or redirect to login --
// see app/(customer)/_layout.tsx etc. for the actual guard.
export default function RootLayout() {
  return (
    <AuthProvider>
      <RegionThemeProvider>
        <StatusBar style="auto" />
        <Slot />
      </RegionThemeProvider>
    </AuthProvider>
  );
}
