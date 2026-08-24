import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = process.env.LINE_USER_OR_GROUP_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendLineNotification(message) {
  if (!lineToken || !lineUserId) {
    console.log('LINE credentials missing. Skipping LINE alert.');
    return;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lineToken}`
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message }]
    })
  });

  if (response.ok) {
    console.log('✅ LINE notification sent successfully!');
  } else {
    const errorText = await response.text();
    console.error('❌ Failed to send LINE notification:', errorText);
  }
}

async function run() {
  console.log('Checking Calibration & PM schedules...');

  // ดึงข้อมูลอุปกรณ์จาก Supabase (ปรับเปลี่ยน query ตามโครงสร้าง table ของคุณ)
  const { data: equipment, error } = await supabase
    .from('medical_equipment')
    .select('*');

  if (error) {
    console.error('Error fetching data from Supabase:', error);
    process.exit(1);
  }

  // ตัวอย่างข้อความแจ้งเตือน
  const message = `🔔 [IT Asset System] ระบบตรวจสอบแจ้งเตือนประจำวัน\nตรวจสอบพบอุปกรณ์ทั้งหมด ${equipment?.length || 0} รายการ`;

  await sendLineNotification(message);
}

run();