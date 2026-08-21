const SUPABASE_URL =
  "YOUR_SUPABASE_PROJECT_URL";

const SUPABASE_KEY =
  "sb_publishable_62-dkeCb0yO9_Llh1hF-tA_MyfjfTKL";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );
