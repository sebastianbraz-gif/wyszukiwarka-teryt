import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kkxuqokpvjmiyhjsxqws.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreHVxb2twdmptaXloanN4cXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NzczNTYsImV4cCI6MjA3ODU1MzM1Nn0.H_eH1J9Xaiz_XZTYoiS61GuOCbiCFbBFjue2CWbQwyM';

export const supabase = createClient(supabaseUrl, supabaseKey);