import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// ตั้งค่า Credentials จาก Environment Variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = process.env.LINE_USER_OR_GROUP_ID;
const resendApiKey = process.env.RESEND_API_KEY;
const emailTo = process.env.ALERT_EMAIL_TO;

const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(resendApiKey);

// คำนวณจำนวนวันคงเหลือเทียบกับวันปัจจุบัน
function getDaysRemaining(dateString) {
  if (!dateString) return null;
  const targetDate = new Date(dateString);
  if (isNaN(targetDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = targetDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// เช็กเงื่อนไขวันของอุปกรณ์ (ส่งแจ้งเตือนเฉพาะวันที่ตรงเป๊ะๆ 30, 7, 0 วัน)
function checkEquipmentStatus(item) {
  const datesToCheck = [
    { label: 'Due Date', date: item.due_date },
    { label: 'Next Due', date: item.next_due },
    { label: 'Next Due 1', date: item.next_due_1 },
  ];

  let highestAlert = null;
  const matchedAlerts = [];

  for (const { label, date } of datesToCheck) {
    const days = getDaysRemaining(date);
    if (days === null) continue;

    if (days === 0) {
      highestAlert = 'RED';
      matchedAlerts.push(`🚨 [ถึงกำหนดวันนี้!] ${label}: ${date}`);
    } else if (days === 7) {
      highestAlert = 'RED';
      matchedAlerts.push(`🔴 [อีก 7 วันถึงกำหนด] ${label}: ${date}`);
    } else if (days === 30) {
      if (highestAlert !== 'RED') highestAlert = 'ORANGE';
      matchedAlerts.push(`🟠 [อีก 30 วันถึงกำหนด] ${label}: ${date}`);
    }
  }

  return { highestAlert, matchedAlerts };
}

// รันกระบวนการดึงข้อมูลและส่งแจ้งเตือน
async function runNotification() {
  console.log('🔍 กำลังดึงข้อมูลจาก Supabase...');
  const { data: items, error } = await supabase.from('medical_equipment').select('*');

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  const redAlerts = [];
  const orangeAlerts = [];

  items.forEach((item) => {
    const { highestAlert, matchedAlerts } = checkEquipmentStatus(item);
    if (highestAlert === 'RED') {
      redAlerts.push({ item, details: matchedAlerts.join(', ') });
    } else if (highestAlert === 'ORANGE') {
      orangeAlerts.push({ item, details: matchedAlerts.join(', ') });
    }
  });

  if (redAlerts.length === 0 && orangeAlerts.length === 0) {
    console.log('✅ ไม่มีรายการที่ต้องแจ้งเตือนตรงวันในวันนี้');
    return;
  }

  const summaryText = buildMessageText(redAlerts, orangeAlerts);

  if (lineToken && lineUserId) {
    await sendLineMessage(summaryText);
  }
  if (resendApiKey && emailTo) {
    await sendEmailNotification(summaryText);
  }
}

function buildMessageText(redAlerts, orangeAlerts) {
  let msg = `⚠️ รายงานแจ้งเตือน Cal/PM เครื่องมือแพทย์ประจำวัน\n`;
  msg += `-----------------------------------\n`;

  if (redAlerts.length > 0) {
    msg += `🔴 ถึงกำหนด / อีก 7 วัน: ${redAlerts.length} รายการ\n`;
    redAlerts.forEach(({ item, details }) => {
      msg += `• [${item.asset_no || 'No ID'}] ${item.asset_name} (${item.department || '-'})\n  └ ${details}\n`;
    });
    msg += `\n`;
  }

  if (orangeAlerts.length > 0) {
    msg += `🟠 ล่วงหน้า 30 วัน: ${orangeAlerts.length} รายการ\n`;
    orangeAlerts.forEach(({ item, details }) => {
      msg += `• [${item.asset_no || 'No ID'}] ${item.asset_name} (${item.department || '-'})\n  └ ${details}\n`;
    });
  }

  return msg;
}

async function sendLineMessage(text) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text }],
      }),
    });
    if (response.ok) console.log('📱 ส่ง LINE Notification สำเร็จ');
    else console.error('FAILED LINE:', await response.text());
  } catch (err) {
    console.error('Error sending LINE:', err);
  }
}

async function sendEmailNotification(text) {
  try {
    await resend.emails.send({
      from: 'Medical Alert <onboarding@resend.dev>',
      to: emailTo,
      subject: '⚠️ รายงานแจ้งเตือนกำหนด Cal/PM เครื่องมือแพทย์',
      text: text,
    });
    console.log('📧 ส่ง Email Notification สำเร็จ');
  } catch (err) {
    console.error('Error sending Email:', err);
  }
}

runNotification();