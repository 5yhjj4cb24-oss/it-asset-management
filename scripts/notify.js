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

  // วันนี้ (เวลา 00:00:00)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // คำนวณวันล่วงหน้า 30 วัน
  const in30Days = new Date(today);
  in30Days.setDate(today.getDate() + 30);

  // กรองเฉพาะเครื่องที่ต้อง Cal หรือ PM ภายใน 30 วันนี้ (หรือเลยกำหนดแล้ว)
  const dueItems = equipment.filter(item => {
    const calDate = item.next_cal_date ? new Date(item.next_cal_date) : null;
    const pmDate = item.next_pm_date ? new Date(item.next_pm_date) : null;

    if (calDate) calDate.setHours(0, 0, 0, 0);
    if (pmDate) pmDate.setHours(0, 0, 0, 0);

    const isCalDue = calDate && calDate <= in30Days;
    const isPmDue = pmDate && pmDate <= in30Days;

    return isCalDue || isPmDue;
  });

  let message = `🔔 [IT Asset Alert] รายงานแจ้งเตือน Cal / PM ล่วงหน้า 30 วัน\n`;
  message += `📅 ประจำวันที่: ${new Date().toLocaleDateString('th-TH')}\n\n`;

  if (dueItems.length === 0) {
    message += `✅ ไม่มีรายการที่ต้อง Cal/PM ในช่วง 30 วันนี้ครับ`;
  } else {
    message += `⚠️ พบรายการต้อง Cal/PM ภายใน 30 วัน (หรือเลยกำหนด) ทั้งหมด ${dueItems.length} รายการ:\n\n`;

    dueItems.slice(0, 10).forEach((item, index) => {
      let details = [];
      if (item.next_cal_date) {
        const calDate = new Date(item.next_cal_date);
        calDate.setHours(0, 0, 0, 0);
        if (calDate <= in30Days) {
          details.push(`Cal: ${item.next_cal_date}`);
        }
      }
      if (item.next_pm_date) {
        const pmDate = new Date(item.next_pm_date);
        pmDate.setHours(0, 0, 0, 0);
        if (pmDate <= in30Days) {
          details.push(`PM: ${item.next_pm_date}`);
        }
      }

      message += `${index + 1}. ${item.name || item.code || 'ไม่ระบุชื่อ'}\n`;
      message += `   • ${details.join(' | ')}\n`;
    });

    if (dueItems.length > 10) {
      message += `\n...และอีก ${dueItems.length - 10} รายการ`;
    }
  }

  await sendLineNotification(message);
  console.log('Notification process completed!');
}

run();