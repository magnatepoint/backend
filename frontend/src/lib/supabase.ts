import { createClient } from '@supabase/supabase-js'

// @ts-expect-error - Vite env variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
// @ts-expect-error - Vite env variables
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Validate environment variables
if (!supabaseUrl || supabaseUrl.includes('your-project') || supabaseUrl.includes('your-actual')) {
  console.error('❌ Missing or invalid VITE_SUPABASE_URL')
  console.error('Please set your Supabase URL in .env.local')
}

if (!supabaseKey || supabaseKey.includes('your') || supabaseKey.length < 100) {
  console.error('❌ Missing or invalid VITE_SUPABASE_ANON_KEY')
  console.error('Please set your Supabase anon key in .env.local')
}

export const supabase = createClient(
  supabaseUrl || 'https://your-project.supabase.co',
  supabaseKey || 'your-supabase-anon-key'
)

