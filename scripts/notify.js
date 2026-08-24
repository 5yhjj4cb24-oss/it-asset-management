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

  // วันนี้ (00:00:00)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // วันล่วงหน้า 30 วัน
  const in30Days = new Date(today);
  in30Days.setDate(today.getDate() + 30);

  // กรองอุปกรณ์ที่ due_date, next_due หรือ next_due_1 อยู่ในช่วง 30 วันนี้ (หรือเลยกำหนด)
  const dueItems = equipment.filter(item => {
    const d1 = item.due_date ? new Date(item.due_date) : null;
    const d2 = item.next_due ? new Date(item.next_due) : null;
    const d3 = item.next_due_1 ? new Date(item.next_due_1) : null;

    if (d1) d1.setHours(0, 0, 0, 0);
    if (d2) d2.setHours(0, 0, 0, 0);
    if (d3) d3.setHours(0, 0, 0, 0);

    const isD1 = d1 && d1 <= in30Days;
    const isD2 = d2 && d2 <= in30Days;
    const isD3 = d3 && d3 <= in30Days;

    return isD1 || isD2 || isD3;
  });

  let message = `🔔 [IT Asset Alert] รายงานแจ้งเตือน Cal / PM ล่วงหน้า 30 วัน\n`;
  message += `📅 ประจำวันที่: ${new Date().toLocaleDateString('th-TH')}\n\n`;

  if (dueItems.length === 0) {
    message += `✅ ไม่มีรายการที่ถึงกำหนด Cal/PM ในช่วง 30 วันนี้ครับ`;
  } else {
    message += `⚠️ พบรายการถึงกำหนด/ใกล้ถึงกำหนด ${dueItems.length} รายการ:\n\n`;

    dueItems.slice(0, 10).forEach((item, index) => {
      let details = [];

      if (item.due_date) {
        const d1 = new Date(item.due_date);
        d1.setHours(0, 0, 0, 0);
        if (d1 <= in30Days) details.push(`Due: ${item.due_date}`);
      }
      if (item.next_due) {
        const d2 = new Date(item.next_due);
        d2.setHours(0, 0, 0, 0);
        if (d2 <= in30Days) details.push(`Next Due: ${item.next_due}`);
      }
      if (item.next_due_1) {
        const d3 = new Date(item.next_due_1);
        d3.setHours(0, 0, 0, 0);
        if (d3 <= in30Days) details.push(`Next Due 1: ${item.next_due_1}`);
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