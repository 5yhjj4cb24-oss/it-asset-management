import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const initialFormState = {
  asset_no: '',
  asset_name: '',
  department: 'ห้องผ่าตัด',
  floor: '',
  location: '',
  quantity: 1,
  unit: 'เครื่อง',
  risk_level: 'Low',
  cal_pm_by: '',
  vendor: '',
  due_date: '',
  next_due: '',
  next_due_1: '',
  note: ''
};

export default function MedicalEquipment() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Dashboard Card Filter ('ALL' | 'High' | 'Medium' | 'Low' | 'ALERTED_DUE')
  const [cardFilter, setCardFilter] = useState('ALL'); 
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  // Hover & Edit State
  const [hoveredId, setHoveredId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFormData, setNewFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  // Custom Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pop-up Alert State สำหรับ Next Due 1
  const [dueModalItems, setDueModalItems] = useState([]);
  const [isDueModalOpen, setIsDueModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [dueStatusInfo, setDueStatusInfo] = useState({
    hasAlertItem: false,
    text: '',
    themeColor: '#10b981'
  });

  useEffect(() => {
    loadData();
  }, []);

  const parseDateStr = (dateStr) => {
    if (!dateStr) return null;
    let s = dateStr.trim();
    if (s.startsWith('-/')) s = '01/' + s.substring(2);

    const parts = s.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10) || 1;
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;

    return null;
  };

  const checkDateMatch = (dateStr, month, year) => {
    if (!dateStr || dateStr === '-') return false;
    const matches = String(dateStr).match(/\d+/g);
    if (!matches) return false;

    let dMonth = '';
    let dYear = '';

    if (matches.length === 3 && matches[0].length === 4) {
      dYear = matches[0];
      dMonth = matches[1];
    } else if (matches.length >= 2) {
      const last = matches[matches.length - 1];
      const secondLast = matches[matches.length - 2];
      if (last.length === 4) {
        dYear = last;
        dMonth = secondLast;
      } else if (matches[0].length === 4) {
        dYear = matches[0];
        dMonth = matches[1];
      }
    } else if (matches.length === 1 && matches[0].length === 4) {
      dYear = matches[0];
    }

    const monthMatch = !month || (dMonth && parseInt(dMonth, 10) === parseInt(month, 10));
    const yearMatch = !year || (dYear && dYear === year);

    return monthMatch && yearMatch;
  };

  useEffect(() => {
    if (items.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const urgentItems = [];

      items.forEach((item) => {
        if (!item.next_due_1) return;
        const targetDate = parseDateStr(item.next_due_1);
        if (!targetDate) return;

        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          urgentItems.push({
            ...item,
            diffDays
          });
        }
      });

      if (urgentItems.length > 0) {
        urgentItems.sort((a, b) => a.diffDays - b.diffDays);
        setDueModalItems(urgentItems);

        const overdueCount = urgentItems.filter(i => i.diffDays <= 0).length;
        const isDanger = overdueCount > 0;

        setDueStatusInfo({
          hasAlertItem: true,
          text: isDanger 
            ? `🚨 รายงานรายการเครื่องมือแพทย์ที่ต้องดำเนินการทั้งหมด ${urgentItems.length} รายการ (เกินกำหนดเวลา ${overdueCount} รายการ)`
            : `⏳ รายงานรายการเครื่องมือแพทย์ครบกำหนดบำรุงรักษา/สอบเทียบ (Cal/PM) ภายใน 30 วัน ทั้งหมด ${urgentItems.length} รายการ`,
          themeColor: isDanger ? '#ef4444' : '#f59e0b'
        });
      } else {
        setDueModalItems([]);
        setDueStatusInfo({
          hasAlertItem: false,
          text: '✅ สถานะปกติ: ไม่พบรายการเครื่องมือแพทย์ที่ถึงกำหนดการบำรุงรักษาหรือสอบเทียบภายใน 30 วัน',
          themeColor: '#10b981'
        });
      }
      setIsDueModalOpen(true);
    }
  }, [items]);

  const handleCloseDueModal = () => {
    setIsDueModalOpen(false);
  };

  const handleJumpToAlertedItems = () => {
    setCardFilter('ALERTED_DUE');
    handleCloseDueModal();
  };

  const handleSelectSpecificItem = (assetNoOrName) => {
    setSearch(assetNoOrName);
    handleCloseDueModal();
  };

  const handleCopyText = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('medical_equipment')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching data:', error);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditFormData({ ...item });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    const { error } = await supabase
      .from('medical_equipment')
      .update(editFormData)
      .eq('id', id);

    if (error) {
      alert('บันทึกไม่สำเร็จ: ' + error.message);
    } else {
      setItems(items.map((item) => (item.id === id ? { ...editFormData } : item)));
      setEditingId(null);
    }
    setSaving(false);
  };

  const handleDelete = (id, assetName) => {
    setDeleteTarget({ id, name: assetName });
  };

  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('medical_equipment')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      alert('ลบไม่สำเร็จ: ' + error.message);
    } else {
      setItems(items.filter((item) => item.id !== deleteTarget.id));
      setEditingId(null);
      setDeleteTarget(null);
    }
    setDeleting(false);
  };

  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const { data, error } = await supabase
      .from('medical_equipment')
      .insert([newFormData])
      .select();

    if (error) {
      alert('เพิ่มรายการไม่สำเร็จ: ' + error.message);
    } else if (data) {
      setItems([...items, data[0]]);
      setIsAddModalOpen(false);
      setNewFormData(initialFormState);
    }
    setSaving(false);
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      (item.asset_no?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (item.asset_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (item.location?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (item.vendor?.toLowerCase() || '').includes(search.toLowerCase());

    const matchesDept = deptFilter ? item.department === deptFilter : true;

    let matchesCard = true;
    if (cardFilter === 'High') {
      matchesCard = item.risk_level === 'High';
    } else if (cardFilter === 'Medium') {
      matchesCard = item.risk_level === 'Medium';
    } else if (cardFilter === 'Low') {
      matchesCard = item.risk_level === 'Low' || !item.risk_level;
    } else if (cardFilter === 'ALERTED_DUE') {
      if (!item.next_due_1 || item.next_due_1 === '-') {
        matchesCard = false;
      } else {
        const targetDate = parseDateStr(item.next_due_1);
        if (!targetDate) {
          matchesCard = false;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = targetDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          matchesCard = diffDays <= 30;
        }
      }
    }

    let matchesMonthYear = true;
    if (monthFilter || yearFilter) {
      matchesMonthYear = checkDateMatch(item.next_due_1, monthFilter, yearFilter);
    }

    return matchesSearch && matchesDept && matchesCard && matchesMonthYear;
  });

  const highRiskCount = items.filter((i) => i.risk_level === 'High').length;
  const mediumRiskCount = items.filter((i) => i.risk_level === 'Medium').length;
  const lowRiskCount = items.filter((i) => i.risk_level === 'Low' || !i.risk_level).length;

  const isAnyFilterActive = cardFilter !== 'ALL' || deptFilter || monthFilter || yearFilter || search;

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Medical Equipment Registry</h1>
          <p style={styles.subtitle}>ระบบจัดการและติดตามสถานะเครื่องมือแพทย์ (IT Asset Management)</p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setIsAddModalOpen(true)}>
          + เพิ่มเครื่องมือแพทย์
        </button>
      </div>

      {/* Analytics Interactive Cards */}
      <div style={styles.statsGrid}>
        <div 
          onClick={() => setCardFilter('ALL')}
          style={{
            ...styles.statCard,
            border: cardFilter === 'ALL' ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
            boxShadow: cardFilter === 'ALL' ? '0 4px 12px rgba(59, 130, 246, 0.08)' : 'none',
            cursor: 'pointer'
          }}
        >
          <div style={styles.statLabel}>เครื่องมือทั้งหมด</div>
          <div style={{ ...styles.statValue, color: '#0f172a' }}>{items.length}</div>
          <div style={styles.statSub}>รายการทั้งหมดในระบบ</div>
        </div>

        <div 
          onClick={() => setCardFilter('High')}
          style={{
            ...styles.statCard,
            border: cardFilter === 'High' ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
            boxShadow: cardFilter === 'High' ? '0 4px 12px rgba(239, 68, 68, 0.08)' : 'none',
            cursor: 'pointer'
          }}
        >
          <div style={styles.statLabel}>ความเสี่ยงสูง (High)</div>
          <div style={{ ...styles.statValue, color: '#dc2626' }}>{highRiskCount}</div>
          <div style={{ ...styles.statSub, color: '#ef4444' }}>ต้องเฝ้าระวัง Cal/PM</div>
        </div>

        <div 
          onClick={() => setCardFilter('Medium')}
          style={{
            ...styles.statCard,
            border: cardFilter === 'Medium' ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
            boxShadow: cardFilter === 'Medium' ? '0 4px 12px rgba(245, 158, 11, 0.08)' : 'none',
            cursor: 'pointer'
          }}
        >
          <div style={styles.statLabel}>ความเสี่ยงปานกลาง (Medium)</div>
          <div style={{ ...styles.statValue, color: '#d97706' }}>{mediumRiskCount}</div>
          <div style={{ ...styles.statSub, color: '#f59e0b' }}>ตรวจเช็กตามรอบ</div>
        </div>

        <div 
          onClick={() => setCardFilter('Low')}
          style={{
            ...styles.statCard,
            border: cardFilter === 'Low' ? '1.5px solid #10b981' : '1px solid #e2e8f0',
            boxShadow: cardFilter === 'Low' ? '0 4px 12px rgba(16, 185, 129, 0.08)' : 'none',
            cursor: 'pointer'
          }}
        >
          <div style={styles.statLabel}>ความเสี่ยงต่ำ (Low)</div>
          <div style={{ ...styles.statValue, color: '#059669' }}>{lowRiskCount}</div>
          <div style={{ ...styles.statSub, color: '#10b981' }}>สถานะปกติ</div>
        </div>
      </div>

      {/* Toolbar & Search */}
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="🔍 ค้นหารหัส, ชื่อเครื่องมือ, ตำแหน่ง หรือ Vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={styles.selectInput}>
            <option value="">ทุกแผนก ({items.length})</option>
            <option value="ห้องผ่าตัด">ห้องผ่าตัด</option>
            <option value="Skin">Skin</option>
            <option value="ทำแผล ชั้น 2">ทำแผล ชั้น 2</option>
            <option value="OPD ชั้น 1">OPD ชั้น 1</option>
            <option value="คลัง">คลัง</option>
          </select>

          {/* ตัวเลือกกรองเดือน (Next Due 1) */}
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={styles.selectInput}>
            <option value="">-- เดือน (Next Due 1) --</option>
            <option value="1">มกราคม (01)</option>
            <option value="2">กุมภาพันธ์ (02)</option>
            <option value="3">มีนาคม (03)</option>
            <option value="4">เมษายน (04)</option>
            <option value="5">พฤษภาคม (05)</option>
            <option value="6">มิถุนายน (06)</option>
            <option value="7">กรกฎาคม (07)</option>
            <option value="8">สิงหาคม (08)</option>
            <option value="9">กันยายน (09)</option>
            <option value="10">ตุลาคม (10)</option>
            <option value="11">พฤศจิกายน (11)</option>
            <option value="12">ธันวาคม (12)</option>
          </select>

          {/* ตัวเลือกกรองปี (Next Due 1) */}
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={styles.selectInput}>
            <option value="">-- ปี (Next Due 1) --</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
          </select>

          {/* ปุ่มล้างตัวกรอง */}
          {isAnyFilterActive && (
            <button
              onClick={() => {
                setCardFilter('ALL');
                setDeptFilter('');
                setMonthFilter('');
                setYearFilter('');
                setSearch('');
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid #fecdd3',
                borderRadius: '6px',
                backgroundColor: '#fff1f2',
                color: '#dc2626',
                cursor: 'pointer',
                fontWeight: '400'
              }}
            >
              ✕ ล้างการกรองทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* แถบเครื่องมือจัดการแก้ไข */}
      {editingId && (
        <div style={styles.editingBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>✏️</span>
            <span style={{ color: '#92400e', fontWeight: '400', fontSize: '13px' }}>
              กำลังแก้ไขรายการ: <strong>{editFormData.asset_name || editFormData.asset_no || 'รายการนี้'}</strong>
            </span>
            <span style={{ color: '#b45309', fontSize: '11px', marginLeft: '8px' }}>
              (กด Enter เพื่อบันทึก / Esc เพื่อยกเลิก)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={styles.saveBtn} onClick={() => handleSaveEdit(editingId)} disabled={saving}>
              💾 บันทึกการแก้ไข
            </button>
            <button style={styles.cancelBtn} onClick={handleCancelEdit}>
              ✖ ยกเลิก
            </button>
            <button style={styles.deleteBtn} onClick={() => handleDelete(editingId, editFormData.asset_name)}>
              🗑️ ลบรายการ
            </button>
          </div>
        </div>
      )}

      {/* Full Table */}
      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loadingBox}>กำลังดึงข้อมูลระบบ...</div>
        ) : filteredItems.length === 0 ? (
          <div style={styles.loadingBox}>ไม่พบข้อมูลตามเงื่อนไขการค้นหา</div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '72vh' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: '35px', textAlign: 'center' }}>#</th>
                  <th style={{ ...styles.th, minWidth: '135px' }}>รหัสทรัพย์สิน</th>
                  <th style={{ ...styles.th, minWidth: '260px' }}>รายการเครื่องมือแพทย์</th>
                  <th style={{ ...styles.th, minWidth: '100px' }}>แผนก</th>
                  <th style={{ ...styles.th, minWidth: '60px' }}>ชั้น</th>
                  <th style={{ ...styles.th, minWidth: '85px' }}>ตำแหน่ง</th>
                  <th style={{ ...styles.th, width: '50px', textAlign: 'center' }}>จำนวน</th>
                  <th style={{ ...styles.th, width: '55px' }}>หน่วย</th>
                  <th style={{ ...styles.th, width: '75px', textAlign: 'center' }}>Risk</th>
                  <th style={{ ...styles.th, minWidth: '90px' }}>Cal/PM โดย</th>
                  <th style={{ ...styles.th, minWidth: '90px' }}>Vendor</th>
                  <th style={{ ...styles.th, minWidth: '95px' }}>Due Date</th>
                  <th style={{ ...styles.th, minWidth: '95px' }}>Next Due</th>
                  <th style={{ ...styles.th, minWidth: '95px' }}>Next Due 1</th>
                  <th style={{ ...styles.th, minWidth: '130px' }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => {
                  const isEditing = editingId === item.id;
                  const isHovered = hoveredId === item.id;

                  const rowBg = isEditing
                    ? '#fffbeb'
                    : isHovered
                    ? '#f8fafc'
                    : index % 2 === 0
                    ? '#ffffff'
                    : '#fdfdfd';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        if (!isEditing) handleStartEdit(item);
                      }}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        backgroundColor: rowBg,
                        cursor: isEditing ? 'default' : 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ ...styles.td, textAlign: 'center', color: '#64748b', fontFamily: 'monospace' }}>
                        {index + 1}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.asset_no || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, asset_no: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span style={styles.assetBadge}>{item.asset_no || '-'}</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.asset_name || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, asset_name: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span style={{ color: '#0f172a', fontWeight: '400' }}>{item.asset_name}</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.department || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.department || '-'
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.floor || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, floor: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.floor || '-'
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.location || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.location || '-'
                        )}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            style={{ ...styles.cellInput, textAlign: 'center' }}
                            value={editFormData.quantity || 1}
                            onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.quantity || '-'
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.unit || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.unit || '-'
                        )}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>
                        {isEditing ? (
                          <select
                            style={styles.cellInput}
                            value={editFormData.risk_level || 'Low'}
                            onChange={(e) => setEditFormData({ ...editFormData, risk_level: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        ) : (
                          <span
                            style={{
                              ...styles.riskBadge,
                              ...(item.risk_level === 'High'
                                ? styles.riskHigh
                                : item.risk_level === 'Medium'
                                ? styles.riskMedium
                                : styles.riskLow)
                            }}
                          >
                            {item.risk_level || 'Low'}
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.cal_pm_by || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, cal_pm_by: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.cal_pm_by || '-'
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.vendor || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, vendor: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.vendor || '-'
                        )}
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace', color: '#d97706' }}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.due_date || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.due_date || '-'
                        )}
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.next_due || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, next_due: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.next_due || '-'
                        )}
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.next_due_1 || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, next_due_1: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.next_due_1 || '-'
                        )}
                      </td>
                      <td style={{ ...styles.td, color: '#475569' }}>
                        {isEditing ? (
                          <input
                            style={styles.cellInput}
                            value={editFormData.note || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, note: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          item.note || '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pop-up Modal แจ้งเตือน (ลากคุมข้อความได้อิสระ + มีปุ่ม Copy 📋 ในตัว) */}
      {isDueModalOpen && (
        <div style={styles.modalOverlay} onClick={handleCloseDueModal}>
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '840px',
              padding: '28px 32px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
              border: '1px solid #e2e8f0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🔔</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '500', color: '#0f172a' }}>
                    รายงานสรุปการแจ้งเตือนรอบบำรุงรักษา (Cal/PM)
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    สามารถลากคุมคัดลอกข้อความ หรือกดปุ่ม 📋 เพื่อคัดลอกรหัสทรัพย์สินได้ทันที
                  </p>
                </div>
              </div>
              <button 
                onClick={handleCloseDueModal}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px 8px',
                  borderRadius: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Alert Status Banner */}
            <div
              style={{
                backgroundColor: dueStatusInfo.hasAlertItem ? (dueStatusInfo.themeColor === '#ef4444' ? '#fef2f2' : '#fffbeb') : '#f0fdf4',
                border: `1px solid ${dueStatusInfo.hasAlertItem ? (dueStatusInfo.themeColor === '#ef4444' ? '#fecdd3' : '#fef3c7') : '#bbf7d0'}`,
                color: dueStatusInfo.hasAlertItem ? (dueStatusInfo.themeColor === '#ef4444' ? '#991b1b' : '#92400e') : '#166534',
                padding: '12px 16px',
                borderRadius: '8px',
                fontWeight: '400',
                fontSize: '13.5px',
                marginBottom: '20px',
                lineHeight: '1.5',
                userSelect: 'text'
              }}
            >
              {dueStatusInfo.text}
            </div>

            {/* Alert Items Table */}
            {dueStatusInfo.hasAlertItem && dueModalItems.length > 0 && (
              <div style={{ maxHeight: '42vh', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 14px', fontWeight: '500', fontSize: '12px', color: '#475569' }}>รหัสทรัพย์สิน</th>
                      <th style={{ padding: '10px 14px', fontWeight: '500', fontSize: '12px', color: '#475569' }}>ชื่อเครื่องมือแพทย์</th>
                      <th style={{ padding: '10px 14px', fontWeight: '500', fontSize: '12px', color: '#475569' }}>แผนก</th>
                      <th style={{ padding: '10px 14px', fontWeight: '500', fontSize: '12px', color: '#475569' }}>วันครบกำหนด</th>
                      <th style={{ padding: '10px 14px', fontWeight: '500', fontSize: '12px', color: '#475569', textAlign: 'center' }}>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueModalItems.map((dueItem, idx) => {
                      const isOverdue = dueItem.diffDays <= 0;
                      const isCopied = copiedId === (dueItem.id || idx);

                      return (
                        <tr
                          key={dueItem.id || idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: '#ffffff',
                            userSelect: 'text'
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#2563eb', fontWeight: '400', userSelect: 'text' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{dueItem.asset_no || '-'}</span>
                              {dueItem.asset_no && (
                                <button
                                  onClick={() => handleCopyText(dueItem.asset_no, dueItem.id || idx)}
                                  title="กดเพื่อคัดลอกรหัสทรัพย์สิน"
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    color: isCopied ? '#16a34a' : '#94a3b8'
                                  }}
                                >
                                  {isCopied ? '✓' : '📋'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#334155', fontWeight: '400', userSelect: 'text', lineHeight: '1.4' }}>
                            {dueItem.asset_name}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b', fontWeight: '400', userSelect: 'text' }}>
                            {dueItem.department || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: isOverdue ? '#dc2626' : '#d97706', fontWeight: '400', userSelect: 'text' }}>
                            {dueItem.next_due_1}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', userSelect: 'text' }}>
                            <button
                              onClick={() => handleSelectSpecificItem(dueItem.asset_no || dueItem.asset_name)}
                              style={{
                                backgroundColor: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '11.5px',
                                fontWeight: '400',
                                cursor: 'pointer'
                              }}
                            >
                              🔍 ค้นหาในตาราง
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {dueStatusInfo.hasAlertItem && (
                <button
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: '400',
                    cursor: 'pointer'
                  }}
                  onClick={handleJumpToAlertedItems}
                >
                  🔍 แสดงรายการในตารางหลัก ({dueModalItems.length} รายการ)
                </button>
              )}
              <button
                style={{
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '400',
                  cursor: 'pointer'
                }}
                onClick={handleCloseDueModal}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div style={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: '380px',
              padding: '24px',
              textAlign: 'center',
              borderRadius: '12px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fef2f2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                margin: '0 auto 12px'
              }}
            >
              🗑️
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '500', color: '#0f172a', margin: '0 0 8px' }}>
              ยืนยันการลบรายการ
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.5, fontWeight: '400' }}>
              คุณต้องการลบรายการเครื่องมือแพทย์ <br />
              <span style={{ color: '#0f172a' }}>"{deleteTarget.name || 'รายการนี้'}"</span> ใช่หรือไม่?
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                style={{ ...styles.secondaryBtn, flex: 1, height: '36px' }}
                onClick={() => setDeleteTarget(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                style={{ ...styles.deleteBtn, flex: 1, height: '36px' }}
                onClick={handleExecuteDelete}
                disabled={deleting}
              >
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal เพิ่มรายการใหม่ */}
      {isAddModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '500', color: '#0f172a' }}>
                ➕ เพิ่มเครื่องมือแพทย์รายการใหม่
              </h3>
              <button style={styles.closeBtn} onClick={() => setIsAddModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAddSubmit} style={{ padding: '20px' }}>
              <div style={styles.formGrid}>
                <div>
                  <label style={styles.label}>รหัสทรัพย์สิน (Asset No.) *</label>
                  <input
                    required
                    style={styles.formInput}
                    placeholder="เช่น D01-04-0001/68"
                    value={newFormData.asset_no}
                    onChange={(e) => setNewFormData({ ...newFormData, asset_no: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>ชื่อเครื่องมือแพทย์ *</label>
                  <input
                    required
                    style={styles.formInput}
                    placeholder="เช่น ELECTROSURGICAL UNIT..."
                    value={newFormData.asset_name}
                    onChange={(e) => setNewFormData({ ...newFormData, asset_name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>แผนก</label>
                  <input
                    style={styles.formInput}
                    placeholder="เช่น ห้องผ่าตัด, Skin"
                    value={newFormData.department}
                    onChange={(e) => setNewFormData({ ...newFormData, department: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>ชั้น / ตำแหน่ง</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      style={styles.formInput}
                      placeholder="ชั้น 3"
                      value={newFormData.floor}
                      onChange={(e) => setNewFormData({ ...newFormData, floor: e.target.value })}
                    />
                    <input
                      style={styles.formInput}
                      placeholder="เล็ก 1"
                      value={newFormData.location}
                      onChange={(e) => setNewFormData({ ...newFormData, location: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label style={styles.label}>จำนวน / หน่วย</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      type="number"
                      min="1"
                      style={styles.formInput}
                      value={newFormData.quantity}
                      onChange={(e) => setNewFormData({ ...newFormData, quantity: parseInt(e.target.value) || 1 })}
                    />
                    <input
                      style={styles.formInput}
                      placeholder="เครื่อง / ชุด"
                      value={newFormData.unit}
                      onChange={(e) => setNewFormData({ ...newFormData, unit: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label style={styles.label}>ระดับความเสี่ยง (Risk)</label>
                  <select
                    style={styles.formInput}
                    value={newFormData.risk_level}
                    onChange={(e) => setNewFormData({ ...newFormData, risk_level: e.target.value })}
                  >
                    <option value="High">High Risk</option>
                    <option value="Medium">Medium Risk</option>
                    <option value="Low">Low Risk</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Cal/PM โดย</label>
                  <input
                    style={styles.formInput}
                    placeholder="เช่น AMS, MiCal"
                    value={newFormData.cal_pm_by}
                    onChange={(e) => setNewFormData({ ...newFormData, cal_pm_by: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>Vendor ผู้จำหน่าย</label>
                  <input
                    style={styles.formInput}
                    placeholder="เช่น AMS, E for L"
                    value={newFormData.vendor}
                    onChange={(e) => setNewFormData({ ...newFormData, vendor: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>Due Date</label>
                  <input
                    style={styles.formInput}
                    placeholder="เช่น 2026-04-02"
                    value={newFormData.due_date}
                    onChange={(e) => setNewFormData({ ...newFormData, due_date: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>Next Due / Next Due 1</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      style={styles.formInput}
                      placeholder="-/9/2026"
                      value={newFormData.next_due}
                      onChange={(e) => setNewFormData({ ...newFormData, next_due: e.target.value })}
                    />
                    <input
                      style={styles.formInput}
                      placeholder="-/3/2027"
                      value={newFormData.next_due_1}
                      onChange={(e) => setNewFormData({ ...newFormData, next_due_1: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={styles.label}>หมายเหตุ (Note)</label>
                <input
                  style={styles.formInput}
                  placeholder="เช่น Free 2PM/year, ในประกัน"
                  value={newFormData.note}
                  onChange={(e) => setNewFormData({ ...newFormData, note: e.target.value })}
                />
              </div>
              <div style={styles.modalFooter}>
                <button type="button" style={styles.secondaryBtn} onClick={() => setIsAddModalOpen(false)}>
                  ยกเลิก
                </button>
                <button type="submit" disabled={saving} style={styles.primaryBtn}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    fontFamily: '"Sarabun", "Inter", system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '500',
    color: '#0f172a'
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#64748b',
    fontWeight: '400'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '20px'
  },
  statCard: {
    backgroundColor: '#ffffff',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
    transition: 'all 0.15s ease'
  },
  statLabel: {
    fontSize: '12px',
    color: '#475569',
    fontWeight: '400'
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '500',
    marginTop: '4px'
  },
  statSub: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
    fontWeight: '400'
  },
  toolbar: {
    backgroundColor: '#ffffff',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  editingBanner: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fef3c7',
    borderRadius: '8px',
    padding: '10px 16px',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  searchInput: {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    width: '260px',
    outline: 'none',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: '400'
  },
  selectInput: {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    cursor: 'pointer',
    fontWeight: '400'
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  th: {
    backgroundColor: '#f8fafc',
    color: '#475569',
    padding: '10px 8px',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: '500',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  td: {
    padding: '8px 8px',
    borderBottom: '1px solid #f1f5f9',
    color: '#0f172a',
    fontWeight: '400',
    verticalAlign: 'middle'
  },
  assetBadge: {
    fontFamily: 'monospace',
    fontWeight: '400',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #dbeafe',
    display: 'inline-block'
  },
  riskBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '400'
  },
  riskHigh: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecdd3'
  },
  riskMedium: {
    backgroundColor: '#fffbeb',
    color: '#92400e',
    border: '1px solid #fef3c7'
  },
  riskLow: {
    backgroundColor: '#f0fdf4',
    color: '#166534',
    border: '1px solid #bbf7d0'
  },
  cellInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    boxSizing: 'border-box',
    color: '#0f172a',
    fontWeight: '400',
    backgroundColor: '#ffffff'
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '400',
    fontSize: '13px',
    cursor: 'pointer'
  },
  secondaryBtn: {
    backgroundColor: '#ffffff',
    color: '#475569',
    padding: '8px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontWeight: '400',
    fontSize: '13px',
    cursor: 'pointer'
  },
  deleteBtn: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '400',
    cursor: 'pointer'
  },
  saveBtn: {
    backgroundColor: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '400',
    cursor: 'pointer'
  },
  cancelBtn: {
    backgroundColor: '#64748b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '400',
    cursor: 'pointer'
  },
  loadingBox: {
    padding: '40px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13.5px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '620px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0'
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    color: '#64748b'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '400',
    color: '#475569',
    marginBottom: '4px'
  },
  formInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    boxSizing: 'border-box',
    outline: 'none',
    color: '#0f172a'
  },
  modalFooter: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px'
  }
};