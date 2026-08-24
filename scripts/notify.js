import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = process.env.LINE_USER_OR_GROUP_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendLineNotification(message) {
  if (!lineToken || !lineUserId) return;

  await fetch('https://api.line.me/v2/bot/message/push', {
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
}

async function run() {
  console.log('Fetching equipment data...');

  const { data: equipment, error } = await supabase
    .from('medical_equipment')
    .select('*');

  if (error) {
    console.error('Error fetching data:', error);
    process.exit(1);
  }

  // เซ็ตเวลาปัจจุบันเป็น 00:00:00 เพื่อเปรียบเทียบเฉพาะวันที่
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // กรองเฉพาะรายการที่ถึงกำหนดหรือเกินกำหนด (วันกำหนด <= วันนี้)
  const dueItems = equipment.filter(item => {
    const calDate = item.next_cal_date ? new Date(item.next_cal_date) : null;
    const pmDate = item.next_pm_date ? new Date(item.next_pm_date) : null;

    if (calDate) calDate.setHours(0, 0, 0, 0);
    if (pmDate) pmDate.setHours(0, 0, 0, 0);

    const isCalDue = calDate && calDate <= today;
    const isPmDue = pmDate && pmDate <= today;

    return isCalDue || isPmDue;
  });

  let message = `🔔 [IT Asset Alert] รายงานถึงกำหนด Cal / PM\n`;
  message += `📅 ประจำวันที่: ${new Date().toLocaleDateString('th-TH')}\n\n`;

  if (dueItems.length === 0) {
    message += `✅ ไม่มีรายการที่ถึงกำหนด Cal/PM ในวันนี้ครับ`;
  } else {
    message += `⚠️ มีอุปกรณ์ถึงกำหนด/เลยกำหนด ${dueItems.length} รายการ:\n\n`;
    
    dueItems.slice(0, 10).forEach((item, index) => {
      const calDate = item.next_cal_date ? new Date(item.next_cal_date) : null;
      const pmDate = item.next_pm_date ? new Date(item.next_pm_date) : null;
      if (calDate) calDate.setHours(0, 0, 0, 0);
      if (pmDate) pmDate.setHours(0, 0, 0, 0);

      let dueTypes = [];
      if (calDate && calDate <= today) dueTypes.push(`Cal (${item.next_cal_date})`);
      if (pmDate && pmDate <= today) dueTypes.push(`PM (${item.next_pm_date})`);

      message += `${index + 1}. ${item.name || item.code || 'ไม่ระบุชื่อ'}\n`;
      message += `   • ถึงกำหนด: ${dueTypes.join(', ')}\n`;
    });

    if (dueItems.length > 10) {
      message += `\n...และอีก ${dueItems.length - 10} รายการ`;
    }
  }

  await sendLineNotification(message);
  console.log('Notification process completed!');
}

run();