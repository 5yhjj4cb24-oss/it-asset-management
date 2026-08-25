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
  const [riskFilter, setRiskFilter] = useState('');

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

  useEffect(() => {
    loadData();
  }, []);

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
    const matchesRisk = riskFilter ? item.risk_level === riskFilter : true;

    return matchesSearch && matchesDept && matchesRisk;
  });

  const highRiskCount = items.filter((i) => i.risk_level === 'High').length;
  const mediumRiskCount = items.filter((i) => i.risk_level === 'Medium').length;
  const lowRiskCount = items.filter((i) => i.risk_level === 'Low' || !i.risk_level).length;

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

      {/* Analytics Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>เครื่องมือทั้งหมด</div>
          <div style={{ ...styles.statValue, color: '#000000' }}>{items.length}</div>
          <div style={styles.statSub}>รายการในระบบ</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>ความเสี่ยงสูง (High)</div>
          <div style={{ ...styles.statValue, color: '#dc2626' }}>{highRiskCount}</div>
          <div style={{ ...styles.statSub, color: '#ef4444' }}>ต้องเฝ้าระวัง Cal/PM</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>ความเสี่ยงปานกลาง (Medium)</div>
          <div style={{ ...styles.statValue, color: '#d97706' }}>{mediumRiskCount}</div>
          <div style={{ ...styles.statSub, color: '#f59e0b' }}>ตรวจเช็กตามรอบ</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>ความเสี่ยงต่ำ (Low)</div>
          <div style={{ ...styles.statValue, color: '#16a34a' }}>{lowRiskCount}</div>
          <div style={{ ...styles.statSub, color: '#22c55e' }}>สถานะปกติ</div>
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={styles.selectInput}>
            <option value="">ทุกแผนก ({items.length})</option>
            <option value="ห้องผ่าตัด">ห้องผ่าตัด</option>
            <option value="Skin">Skin</option>
            <option value="ทำแผล ชั้น 2">ทำแผล ชั้น 2</option>
            <option value="OPD ชั้น 1">OPD ชั้น 1</option>
            <option value="คลัง">คลัง</option>
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={styles.selectInput}>
            <option value="">ทุกระดับ Risk</option>
            <option value="High">High Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="Low">Low Risk</option>
          </select>
        </div>
      </div>

      {/* แถบเครื่องมือจัดการแก้ไข (แสดงเมื่อกำลังแก้ไขแถว) */}
      {editingId && (
        <div style={styles.editingBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>✏️</span>
            <span style={{ color: '#92400e', fontWeight: '500', fontSize: '13px' }}>
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

      {/* Full 15-Column Table */}
      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loadingBox}>กำลังดึงข้อมูลจาก Supabase...</div>
        ) : filteredItems.length === 0 ? (
          <div style={styles.loadingBox}>ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา</div>
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
                    ? '#eff6ff'
                    : index % 2 === 0
                    ? '#ffffff'
                    : '#f8fafc';

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
                      {/* # */}
                      <td style={{ ...styles.td, textAlign: 'center', color: '#000000', fontFamily: 'monospace' }}>
                        {index + 1}
                      </td>

                      {/* รหัสทรัพย์สิน */}
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

                      {/* ชื่อเครื่องมือ */}
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
                          <span style={{ color: '#000000', fontWeight: '400' }}>{item.asset_name}</span>
                        )}
                      </td>

                      {/* แผนก */}
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

                      {/* ชั้น */}
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

                      {/* ตำแหน่ง */}
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

                      {/* จำนวน */}
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

                      {/* หน่วย */}
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

                      {/* Risk */}
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

                      {/* Cal/PM โดย */}
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

                      {/* Vendor */}
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

                      {/* Due Date */}
                      <td style={{ ...styles.td, fontFamily: 'monospace', color: '#b45309' }}>
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

                      {/* Next Due */}
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

                      {/* Next Due 1 */}
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

                      {/* หมายเหตุ */}
                      <td style={{ ...styles.td, color: '#000000' }}>
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

      {/* Modern Custom Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: '380px',
              padding: '28px 24px',
              textAlign: 'center',
              borderRadius: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#ffe4e6',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                margin: '0 auto 16px'
              }}
            >
              🗑️
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: '600', color: '#000000', margin: '0 0 8px' }}>
              ยืนยันการลบรายการ
            </h3>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 24px', lineHeight: 1.5 }}>
              คุณต้องการลบรายการเครื่องมือแพทย์ <br />
              <strong style={{ color: '#000000' }}>"{deleteTarget.name || 'รายการนี้'}"</strong> ใช่หรือไม่?
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                style={{ ...styles.secondaryBtn, flex: 1, height: '38px' }}
                onClick={() => setDeleteTarget(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                style={{ ...styles.deleteBtn, flex: 1, height: '38px' }}
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
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '500', color: '#000000' }}>
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
    fontFamily: '"Sarabun", "Prompt", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    fontSize: '22px',
    fontWeight: '600',
    color: '#000000'
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#475569',
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
    border: '1px solid #bfdbfe',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
  },
  statLabel: {
    fontSize: '12px',
    color: '#000000',
    fontWeight: '500'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '600',
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
    border: '1px solid #bfdbfe',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  editingBanner: {
    backgroundColor: '#fef3c7',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '10px 16px',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
  },
  searchInput: {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #93c5fd',
    borderRadius: '6px',
    width: '300px',
    outline: 'none',
    backgroundColor: '#f0f9ff',
    color: '#000000',
    fontWeight: '400'
  },
  selectInput: {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #93c5fd',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#000000',
    outline: 'none',
    cursor: 'pointer',
    fontWeight: '400'
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #93c5fd',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  th: {
    backgroundColor: '#dbeafe',
    color: '#000000',
    padding: '10px 8px',
    border: '1px solid #93c5fd',
    fontWeight: '500',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  td: {
    padding: '8px 8px',
    border: '1px solid #e2e8f0',
    color: '#000000',
    fontWeight: '400',
    verticalAlign: 'middle'
  },
  assetBadge: {
    fontFamily: 'monospace',
    fontWeight: '500',
    color: '#000000',
    backgroundColor: '#eff6ff',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #bfdbfe',
    display: 'inline-block'
  },
  riskBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '500'
  },
  riskHigh: {
    backgroundColor: '#ffe4e6',
    color: '#be123c',
    border: '1px solid #fecdd3'
  },
  riskMedium: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
    border: '1px solid #fde68a'
  },
  riskLow: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    border: '1px solid #bbf7d0'
  },
  cellInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    boxSizing: 'border-box',
    color: '#000000',
    fontWeight: '400',
    backgroundColor: '#ffffff'
  },
  primaryBtn: {
    backgroundColor: '#dbeafe',
    color: '#000000',
    border: '1px solid #60a5fa',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '500',
    fontSize: '13px',
    cursor: 'pointer'
  },
  secondaryBtn: {
    backgroundColor: '#e2e8f0',
    color: '#000000',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    fontWeight: '500',
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
    fontWeight: '500',
    cursor: 'pointer'
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  cancelBtn: {
    backgroundColor: '#64748b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  loadingBox: {
    padding: '40px',
    textAlign: 'center',
    color: '#000000',
    fontSize: '14px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(3px)'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '650px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
    border: '1px solid #bfdbfe'
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #bfdbfe',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#dbeafe'
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#000000'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: '#000000',
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
    color: '#000000'
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