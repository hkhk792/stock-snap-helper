import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = 'https://ilithpgmpjxfsriutkyt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsaXRocGdtcGp4ZnNyaXV0a3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzQ2NTMsImV4cCI6MjA4OTUxMDY1M30.V-uDb3xlfZ0YGK4sOFrPCQ19ezCpNx7_FSpt4o6jeF4';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
