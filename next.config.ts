import type { NextConfig } from "next";
import { supabaseConfigurationError } from "./lib/config";
const connectionError = supabaseConfigurationError(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
if (connectionError) throw new Error(connectionError);
const nextConfig: NextConfig = { poweredByHeader: false };
export default nextConfig;
