import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = process.env.LINE_USER_OR_GROUP_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCustomDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();

  const fullMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullMatch) {
    return new Date(parseInt(fullMatch[3]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[1]));
  }

  const monthYearMatch = cleaned.match(/(\d{1,2})\/(\d{4})/);
  if (monthYearMatch) {
    return new Date(parseInt(monthYearMatch[2]), parseInt(monthYearMatch[1]) - 1, 1);
  }

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

    return (d1 && d1 <= in30Days) || (d2 && d2 <= in30Days) || (d3 && d3 <= in30Days);
  });

  let message = `🔔 [IT Asset Alert] รายงาน Cal / PM\n`;
  message += `📅 ประจำวันที่: ${new Date().toLocaleDateString('th-TH')}\n`;
  message += `⚠️ พบรายการต้องดำเนินการทั้งหมด: ${dueItems.length} รายการ\n`;
  message += `───────────────────────\n\n`;

  if (dueItems.length === 0) {
    message += `✅ ไม่มีรายการที่ต้อง Cal/PM ในช่วง 30 วันนี้ครับ`;
  } else {
    // แสดงผล 8 รายการแรกเพื่อไม่ให้ข้อความยาวเกินไป
    dueItems.slice(0, 8).forEach((item, index) => {
      const d1 = parseCustomDate(item.due_date);
      const d2 = parseCustomDate(item.next_due);
      const d3 = parseCustomDate(item.next_due_1);

      let isOverdue = false;
      let details = [];

      if (d1) {
        d1.setHours(0, 0, 0, 0);
        if (d1 <= in30Days) {
          details.push(`Due: ${item.due_date}`);
          if (d1 < today) isOverdue = true;
        }
      }
      if (d2) {
        d2.setHours(0, 0, 0, 0);
        if (d2 <= in30Days) {
          details.push(`Next: ${item.next_due}`);
          if (d2 < today) isOverdue = true;
        }
      }
      if (d3) {
        d3.setHours(0, 0, 0, 0);
        if (d3 <= in30Days) {
          details.push(`Next 1: ${item.next_due_1}`);
          if (d3 < today) isOverdue = true;
        }
      }

      const statusIcon = isOverdue ? '🔴 เลยกำหนด' : '🟡 ใกล้ถึงกำหนด';
      const name = item.asset_name || item.name || 'ไม่ระบุชื่ออุปกรณ์';
      const assetNo = item.asset_no || item.code ? ` (${item.asset_no || item.code})` : '';

      message += `${index + 1}. [${statusIcon}]\n`;
      message += `📦 ${name}${assetNo}\n`;
      message += `🗓️ ${details.join(' | ')}\n`;
      message += `───────────────────────\n`;
    });

    if (dueItems.length > 8) {
      message += `\n...และยังมีอีก ${dueItems.length - 8} รายการในระบบ`;
    }
  }

  await sendLineNotification(message);
  console.log('Notification process completed!');
}

run();