import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cocexpxacshzhxzkoriz.supabase.co',
  'sb_publishable_32EtPKtsj0_Kq0_-sv9sBw_MhAyHQ-E'
);

export default supabase;