import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = process.env.LINE_USER_OR_GROUP_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

// ฟังก์ชันแปลงรูปแบบวันที่หลากหลาย (รองรับ -/9/2026 และ warranty 11/2026)
function parseCustomDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();

  // 1. รูปแบบ D/M/YYYY หรือ DD/MM/YYYY (เช่น 2/4/2026)
  const fullMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullMatch) {
    return new Date(parseInt(fullMatch[3]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[1]));
  }

  // 2. รูปแบบ -/M/YYYY หรือข้อความที่มี M/YYYY (เช่น -/9/2026 หรือ warranty 11/2026)
  const monthYearMatch = cleaned.match(/(\d{1,2})\/(\d{4})/);
  if (monthYearMatch) {
    // ให้ถือว่าเป็นวันที่ 1 ของเดือนนั้นๆ
    return new Date(parseInt(monthYearMatch[2]), parseInt(monthYearMatch[1]) - 1, 1);
  }

  // 3. รูปแบบมาตรฐาน ISO (เช่น 2026-04-02)
  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const in30Days = new Date(today);
  in30Days.setDate(today.getDate() + 30);

  const dueItems = equipment.filter(item => {
    const d1 = parseCustomDate(item.due_date);
    const d2 = parseCustomDate(item.next_due);
    const d3 = parseCustomDate(item.next_due_1);

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
    message += `✅ ไม่มีรายการที่ต้อง Cal/PM ในช่วง 30 วันนี้ครับ`;
  } else {
    message += `⚠️ พบรายการถึงกำหนด/ใกล้ถึงกำหนด ${dueItems.length} รายการ:\n\n`;

    dueItems.slice(0, 10).forEach((item, index) => {
      let details = [];

      const d1 = parseCustomDate(item.due_date);
      const d2 = parseCustomDate(item.next_due);
      const d3 = parseCustomDate(item.next_due_1);

      if (d1) { d1.setHours(0, 0, 0, 0); if (d1 <= in30Days) details.push(`Due: ${item.due_date}`); }
      if (d2) { d2.setHours(0, 0, 0, 0); if (d2 <= in30Days) details.push(`Next: ${item.next_due}`); }
      if (d3) { d3.setHours(0, 0, 0, 0); if (d3 <= in30Days) details.push(`Next 1: ${item.next_due_1}`); }

      message += `${index + 1}. ${item.asset_name || item.asset_no || 'ไม่ระบุชื่อ'}\n`;
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