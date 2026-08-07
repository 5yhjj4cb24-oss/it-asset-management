import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const PAGE_SIZE = 20

// 🔍 ตรวจจับ "ชื่อคน"
function isPersonName(text) {
  if (!text || typeof text !== 'string') return false
  const str = text.trim()

  const hasPrefix = /^(น\.ส\.|นาย|นาง|คุณ|mr\.|mrs\.|ms\.)/i.test(str)
  const hasNickname = /\([\u0E00-\u0E7Fa-zA-Z0-9_]+\)/.test(str)
  const isRoomOrDept = /^(ห้อง|ชั้น|แผนก|อยู่ที่|คลัง|counter|โต๊ะ|หลังโต๊ะ)/i.test(str)

  return (hasPrefix || hasNickname) && !isRoomOrDept
}

// 🧠 สกัดผู้ถือครองแท้จริง
function getRealAssetHolder(item) {
  if (!item) return { realHolder: '-', holderType: 'DEPT', realLocation: '-', isResigned: false }

  const holderCol = (item['ผู้ถือครอง'] || item.owner || item.user || item.holder || item.assigned_to || item.emp_name || '').trim()
  const locationCol = (item['Location'] || item.location || item['Location (ชั้น)'] || '').trim()
  const remarkCol = (item.Remark || item.remark || '').trim()

  const isResigned = holderCol.includes('ลาออก') || locationCol.includes('ลาออก') || remarkCol.includes('รับคืนพนักงานลาออก') || remarkCol.includes('ลาออก') || remarkCol.includes('สูญหาย')

  if (isPersonName(holderCol)) {
    return {
      realHolder: holderCol,
      holderType: 'PERSON',
      realLocation: isPersonName(locationCol) ? '-' : (locationCol || '-'),
      isResigned
    }
  }

  if (isPersonName(locationCol)) {
    return {
      realHolder: locationCol,
      holderType: 'PERSON',
      realLocation: holderCol ? `อยู่ที่ ${holderCol}` : '-',
      isResigned
    }
  }

  return {
    realHolder: holderCol || item.dept || 'ส่วนกลาง',
    holderType: 'DEPT',
    realLocation: locationCol || '-',
    isResigned
  }
}

// ⏳ คำนวณอายุและป้ายสีอุปกรณ์ (Asset Aging Badge)
function getAssetAgeInfo(item) {
  let yearAD = null
  const rawDate = item.Date || item.purchase || ''
  const matchYear = rawDate.match(/(20\d{2}|25\d{2})/)

  if (matchYear) {
    let y = parseInt(matchYear[1])
    yearAD = y > 2500 ? y - 543 : y
  } else if (item.asset_no) {
    const matchBE = item.asset_no.match(/\/(\d{2})$/)
    if (matchBE) {
      const be2Digit = parseInt(matchBE[1])
      const beFull = be2Digit > 40 ? 2500 + be2Digit : 2000 + be2Digit
      yearAD = beFull > 2500 ? beFull - 543 : beFull
    }
  }

  if (!yearAD) {
    return { ageText: 'ไม่ระบุปี', badgeClass: 'age-unknown', label: '⚪ ไม่ระบุปี' }
  }

  const currentYear = new Date().getFullYear()
  const age = currentYear - yearAD

  if (age >= 4) {
    return { ageText: `${age} ปี`, badgeClass: 'age-old', label: `🔴 ${age} ปี (ควรเปลี่ยน)` }
  } else if (age >= 2) {
    return { ageText: `${age} ปี`, badgeClass: 'age-mid', label: `🟡 ${age} ปี (ระยะกลาง)` }
  } else {
    return { ageText: `${age <= 0 ? 'ใหม่' : age + ' ปี'}`, badgeClass: 'age-new', label: `🟢 ${age <= 0 ? 'ใหม่ปีนี้' : age + ' ปี (ใหม่)'}` }
  }
}

// 💻 เลือกไอคอนประเภทอุปกรณ์
function getAssetTypeIcon(typeStr) {
  const t = (typeStr || '').toUpperCase()
  if (t.includes('NB') || t.includes('NOTEBOOK') || t.includes('LAPTOP')) return '💻'
  if (t.includes('MONITOR') || t.includes('DISPLAY') || t.includes('SCREEN')) return '🖥️'
  if (t.includes('PC') || t.includes('AIO') || t.includes('DESKTOP')) return '🖥️'
  if (t.includes('UPS')) return '🔌'
  if (t.includes('CCTV') || t.includes('CAMERA')) return '📹'
  if (t.includes('NETWORK') || t.includes('SWITCH') || t.includes('ROUTER')) return '🌐'
  if (t.includes('HDD') || t.includes('STORAGE')) return '💾'
  return '📦'
}

const emptyForm = {
  asset_no: '',
  asset_name: '',
  type: '',
  brand: '',
  model: '',
  serialnumber: '',
  dept: '',
  owner: '',
  location: '',
  Remark: ''
}

function App() {
  const [allRawAssets, setAllRawAssets] = useState([])
  const [displayedAssets, setDisplayedAssets] = useState([])
  const [summary, setSummary] = useState([])
  const [deptList, setDeptList] = useState([])
  const [loading, setLoading] = useState(true)

  // 📅 State ปฏิทินและเวลาอัปเดตอัตโนมัติ Real-time
  const [currentDateTime, setCurrentDateTime] = useState('')

  // State การดูข้อมูล
  const [viewMode, setViewMode] = useState('all')
  const [personDisplayFormat, setPersonDisplayFormat] = useState('cards')
  const [selectedAsset, setSelectedAsset] = useState(null)

  // State สำหรับคลิกหมวดหมู่ทรัพย์สิน (สัดส่วนทรัพย์สิน)
  const [selectedCategoryModal, setSelectedCategoryModal] = useState(null)
  const [categorySearch, setCategorySearch] = useState('')

  // State สำหรับ CRUD
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  // State สำหรับ Modal รับคืนทรัพย์สินเข้าส่วนกลาง (ระบุแผนกได้)
  const [returningAsset, setReturningAsset] = useState(null)
  const [returnFormData, setReturnFormData] = useState({
    dept: 'แผนกสารสนเทศ',
    owner: 'ส่วนกลาง',
    location: 'ห้องเก็บของ IT',
    remark: ''
  })

  // State การค้นหา ตัวกรอง และแบ่งหน้า
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalFilteredCount, setTotalFilteredCount] = useState(0)

  // 📅ระบบนาฬิกาและปฏิทิน อัปเดตทุก 1 วินาที
  useEffect(() => {
    const updateCalendar = () => {
      const now = new Date()
      const dateStr = now.toLocaleDateString('th-TH', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
      const timeStr = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      setCurrentDateTime(`📅 ${dateStr} | 🕒 ${timeStr} น.`)
    }

    updateCalendar()
    const timer = setInterval(updateCalendar, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    loadAllData()
  }, [])

  useEffect(() => {
    applyFiltersAndPagination()
  }, [searchTerm, selectedDept, viewMode, currentPage, allRawAssets])

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }

  const handleDeptChange = (e) => {
    setSelectedDept(e.target.value)
    setCurrentPage(1)
  }

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    setCurrentPage(1)
  }

  // 1. ดึงข้อมูลจาก Supabase
  async function loadAllData() {
    setLoading(true)
    try {
      const { data: summaryData } = await supabase
        .from('view_asset_summary_by_type')
        .select('*')
      setSummary(summaryData || [])

      const { data: assetData, error } = await supabase
        .from('assets_v2')
        .select('*')

      if (error) {
        console.error('Fetch error:', error)
      } else if (assetData) {
        setAllRawAssets(assetData)

        const uniqueDepts = [...new Set(assetData.map(d => d.dept).filter(Boolean))].sort()
        setDeptList(uniqueDepts)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  // 2. กรองและแบ่งหน้า
  function applyFiltersAndPagination() {
    let result = [...allRawAssets]

    if (viewMode === 'person') {
      result = result.filter(item => getRealAssetHolder(item).holderType === 'PERSON')
    } else if (viewMode === 'dept') {
      result = result.filter(item => getRealAssetHolder(item).holderType === 'DEPT')
    }

    if (selectedDept === '__UNASSIGNED__') {
      result = result.filter(item => !item.dept || item.dept.trim() === '')
    } else if (selectedDept !== '') {
      result = result.filter(item => item.dept === selectedDept)
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim()
      result = result.filter(item => {
        const { realHolder, realLocation } = getRealAssetHolder(item)
        const searchableText = `${JSON.stringify(item)} ${realHolder} ${realLocation}`.toLowerCase()
        return searchableText.includes(term)
      })
    }

    setTotalFilteredCount(result.length)

    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE
    setDisplayedAssets(result.slice(from, to))
  }

  // จัดกลุ่มข้อมูลพนักงานสำหรับการ์ด (Person Grouping)
  function getGroupedPersonAssets() {
    const personMap = {}
    
    let filteredPersonAssets = allRawAssets.filter(item => getRealAssetHolder(item).holderType === 'PERSON')

    if (selectedDept === '__UNASSIGNED__') {
      filteredPersonAssets = filteredPersonAssets.filter(item => !item.dept || item.dept.trim() === '')
    } else if (selectedDept !== '') {
      filteredPersonAssets = filteredPersonAssets.filter(item => item.dept === selectedDept)
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim()
      filteredPersonAssets = filteredPersonAssets.filter(item => {
        const { realHolder, realLocation } = getRealAssetHolder(item)
        return `${JSON.stringify(item)} ${realHolder} ${realLocation}`.toLowerCase().includes(term)
      })
    }

    filteredPersonAssets.forEach(item => {
      const { realHolder, isResigned } = getRealAssetHolder(item)
      if (!personMap[realHolder]) {
        personMap[realHolder] = {
          name: realHolder,
          dept: item.dept || 'ไม่ระบุแผนก',
          isResigned,
          assets: []
        }
      }
      personMap[realHolder].assets.push(item)
    })

    return Object.values(personMap)
  }

  // 🔄 เปิด Modal รับคืนทรัพย์สินเข้าส่วนกลาง (ให้เลือกแผนกได้)
  function handleOpenReturnModal(item) {
    const { realHolder } = getRealAssetHolder(item)
    setReturningAsset(item)
    setReturnFormData({
      dept: 'แผนกสารสนเทศ',
      owner: 'ส่วนกลาง',
      location: 'ห้องเก็บของ IT',
      remark: `[รับคืนพนักงาน] เดิมถือครองโดย: ${realHolder}`
    })
  }

  // 🔄 บันทึกการรับคืนทรัพย์สิน
  async function executeReturnToStock(e) {
    e.preventDefault()
    if (!returningAsset) return

    try {
      setLoading(true)
      const updatePayload = {
        dept: returnFormData.dept,
        owner: returnFormData.owner,
        location: returnFormData.location,
        Remark: `${returnFormData.remark} (อัปเดตเมื่อ ${new Date().toLocaleDateString('th-TH')})`
      }

      let query = supabase.from('assets_v2').update(updatePayload)
      if (returningAsset.id) {
        query = query.eq('id', returningAsset.id)
      } else {
        query = query.eq('asset_no', returningAsset.asset_no)
      }

      const { error } = await query
      if (error) throw error

      alert(`รับคืนทรัพย์สินเข้าแผนก "${returnFormData.dept}" เรียบร้อยแล้ว!`)
      setReturningAsset(null)
      setSelectedAsset(null)
      loadAllData()
    } catch (err) {
      console.error('Return error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenAddModal() {
    setEditingAsset(null)
    setFormData(emptyForm)
    setIsFormOpen(true)
  }

  function handleOpenEditModal(item) {
    setEditingAsset(item)
    setFormData({
      asset_no: item.asset_no || '',
      asset_name: item.asset_name || '',
      type: item.type || '',
      brand: item.brand || '',
      model: item.model || '',
      serialnumber: item.serialnumber || item.serial_no || '',
      dept: item.dept || '',
      owner: item.owner || '',
      location: item.location || '',
      Remark: item.Remark || item.remark || ''
    })
    setIsFormOpen(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    if (!formData.asset_name.trim()) {
      alert('กรุณากรอกชื่ออุปกรณ์')
      return
    }

    setSubmitting(true)
    try {
      if (editingAsset) {
        let query = supabase.from('assets_v2').update(formData)
        if (editingAsset.id) {
          query = query.eq('id', editingAsset.id)
        } else {
          query = query.eq('asset_no', editingAsset.asset_no)
        }
        const { error } = await query
        if (error) throw error
        alert('แก้ไขข้อมูลสำเร็จ!')
      } else {
        const { error } = await supabase.from('assets_v2').insert([formData])
        if (error) throw error
        alert('เพิ่มทรัพย์สินสำเร็จ!')
      }

      setIsFormOpen(false)
      setSelectedAsset(null)
      loadAllData()
    } catch (err) {
      console.error('Submit error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteAsset(item) {
    const assetIdentifier = item.asset_name || item.asset_no || 'รายการนี้'
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${assetIdentifier}" ออกจากระบบ?`)) return

    try {
      setLoading(true)
      let query = supabase.from('assets_v2').delete()
      if (item.id) {
        query = query.eq('id', item.id)
      } else {
        query = query.eq('asset_no', item.asset_no)
      }
      const { error } = await query
      if (error) throw error

      alert('ลบทรัพย์สินเรียบร้อยแล้ว')
      setSelectedAsset(null)
      loadAllData()
    } catch (err) {
      console.error('Delete error:', err)
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Export CSV
  function exportToCSV() {
    if (!allRawAssets || allRawAssets.length === 0) {
      alert('ไม่มีข้อมูลสำหรับ Export')
      return
    }

    const headers = ['Asset No', 'Asset Name', 'Type', 'Brand', 'Department', 'Holder Type', 'Real Owner/User', 'Location', 'Remark']
    const csvRows = [headers.join(',')]

    allRawAssets.forEach(item => {
      const { realHolder, holderType, realLocation } = getRealAssetHolder(item)
      const row = [
        `"${item.asset_no || ''}"`,
        `"${(item.asset_name || '').replace(/"/g, '""')}"`,
        `"${item.type || ''}"`,
        `"${item.brand || ''}"`,
        `"${item.dept || ''}"`,
        `"${holderType === 'PERSON' ? 'บุคคล' : 'ส่วนกลาง/แผนก'}"`,
        `"${realHolder}"`,
        `"${realLocation}"`,
        `"${(item.Remark || item.remark || '').replace(/"/g, '""')}"`
      ]
      csvRows.push(row.join(','))
    })

    const csvContent = '\uFEFF' + csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `IT_Assets_Export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE) || 1
  const groupedPersons = getGroupedPersonAssets()

  return (
    <div className="app-layout" style={{ backgroundColor: '#faf8fc', minHeight: '100vh' }}>
      {/* Top Navbar */}
      <header className="top-nav" style={{ backgroundColor: '#ffffff', borderBottom: '2px solid #18181b' }}>
        <div className="nav-brand">
          <div className="brand-icon" style={{ backgroundColor: '#18181b', color: '#f472b6', borderRadius: '8px', fontWeight: 800 }}>IT</div>
          <span className="brand-name" style={{ color: '#09090b', fontWeight: 800 }}>IT Asset Management System</span>
        </div>
        
        <div className="user-badge" style={{ backgroundColor: '#18181b', border: '1px solid #27272a', color: '#ffffff' }}>
          <span className="status-dot" style={{ backgroundColor: '#f472b6' }}></span>
          <span style={{ fontWeight: 500, color: '#f43f5e' }}>
            {currentDateTime || '📅 กำลังโหลดเวลา...'}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-container">
        {/* Page Header */}
        <div className="page-header">
          <h1 className="page-title" style={{ color: '#09090b', fontWeight: 800 }}>IT Asset Overview</h1>
          <p className="page-desc" style={{ color: '#52525b' }}>ระบบบริหารจัดการ ตรวจสอบ และจำแนกผู้ถือครองทรัพย์สินไอที</p>
        </div>

        {/* Top Executive KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card" style={{ backgroundColor: '#f3e8ff', border: '2px solid #18181b', boxShadow: '3px 3px 0px #18181b' }}>
            <div className="kpi-content">
              <span className="kpi-title" style={{ color: '#18181b', fontWeight: 700 }}>รวมทรัพย์สินไอทีในระบบ</span>
              <div className="kpi-value-container">
                <span className="kpi-value" style={{ color: '#09090b', fontWeight: 800 }}>{allRawAssets.length.toLocaleString()}</span>
                <span className="kpi-unit" style={{ color: '#6b21a8' }}>รายการ</span>
              </div>
            </div>
            <div className="kpi-icon-badge" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>📦</div>
          </div>

          <div className="kpi-card" style={{ backgroundColor: '#fce7f3', border: '2px solid #18181b', boxShadow: '3px 3px 0px #18181b' }}>
            <div className="kpi-content">
              <span className="kpi-title" style={{ color: '#18181b', fontWeight: 700 }}>มุมมองสิทธิ์การครอบครอง</span>
              <div className="kpi-value-container">
                <span className="kpi-value" style={{ fontSize: '18px', color: '#09090b', fontWeight: 800 }}>
                  {viewMode === 'all' && 'ทรัพย์สินทั้งหมด'}
                  {viewMode === 'person' && 'ถือครองรายบุคคล'}
                  {viewMode === 'dept' && 'ส่วนกลาง / แผนก'}
                </span>
              </div>
            </div>
            <div className="kpi-icon-badge" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>
              {viewMode === 'person' ? '👤' : viewMode === 'dept' ? '🏢' : '🌐'}
            </div>
          </div>

          <div className="kpi-card" style={{ backgroundColor: '#fae8ff', border: '2px solid #18181b', boxShadow: '3px 3px 0px #18181b' }}>
            <div className="kpi-content">
              <span className="kpi-title" style={{ color: '#18181b', fontWeight: 700 }}>หมวดหมู่อุปกรณ์ไอที</span>
              <div className="kpi-value-container">
                <span className="kpi-value" style={{ color: '#09090b', fontWeight: 800 }}>{summary.length}</span>
                <span className="kpi-unit" style={{ color: '#86198f' }}>จำพวก</span>
              </div>
            </div>
            <div className="kpi-icon-badge" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>🏷️</div>
          </div>

          <div className="kpi-card" style={{ backgroundColor: '#fdf4ff', border: '2px solid #18181b', boxShadow: '3px 3px 0px #18181b' }}>
            <div className="kpi-content">
              <span className="kpi-title" style={{ color: '#18181b', fontWeight: 700 }}>รายการตรวจพบตามตัวกรอง</span>
              <div className="kpi-value-container">
                <span className="kpi-value" style={{ color: '#09090b', fontWeight: 800 }}>
                  {totalFilteredCount.toLocaleString()}
                </span>
                <span className="kpi-unit" style={{ color: '#701a75' }}>รายการ</span>
              </div>
            </div>
            <div className="kpi-icon-badge" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>🎯</div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="dashboard-content">
          
          {/* Main Panel */}
          <div className="panel-card" style={{ backgroundColor: '#ffffff', border: '1px solid #18181b' }}>
            
            {/* แท็บเลือกโหมดถือครอง (Tabs) */}
            <div style={{ padding: '12px 20px 0', borderBottom: '1px solid #18181b', display: 'flex', gap: '8px', backgroundColor: '#fdf4ff' }}>
              <button 
                onClick={() => handleViewModeChange('all')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px 6px 0 0',
                  border: '1px solid #18181b',
                  borderBottom: viewMode === 'all' ? '3px solid #18181b' : 'none',
                  backgroundColor: viewMode === 'all' ? '#18181b' : 'transparent',
                  color: viewMode === 'all' ? '#ffffff' : '#09090b',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                📦 ทั้งหมด ({allRawAssets.length.toLocaleString()})
              </button>

              <button 
                onClick={() => handleViewModeChange('person')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px 6px 0 0',
                  border: '1px solid #18181b',
                  borderBottom: viewMode === 'person' ? '3px solid #18181b' : 'none',
                  backgroundColor: viewMode === 'person' ? '#18181b' : 'transparent',
                  color: viewMode === 'person' ? '#ffffff' : '#09090b',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                👤 รายบุคคลถือครอง
              </button>

              <button 
                onClick={() => handleViewModeChange('dept')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px 6px 0 0',
                  border: '1px solid #18181b',
                  borderBottom: viewMode === 'dept' ? '3px solid #18181b' : 'none',
                  backgroundColor: viewMode === 'dept' ? '#18181b' : 'transparent',
                  color: viewMode === 'dept' ? '#ffffff' : '#09090b',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                🏢 รายแผนก / ส่วนกลางถือครอง
              </button>
            </div>

            {/* Filter & Action Controls Bar */}
            <div className="panel-header" style={{ flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #f3e8ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="panel-title" style={{ color: '#09090b', fontWeight: 800 }}>
                  {viewMode === 'all' && 'รายการทรัพย์สินทั้งหมด'}
                  {viewMode === 'person' && `โปรไฟล์การถือครองรายบุคคล (${groupedPersons.length} คน)`}
                  {viewMode === 'dept' && 'รายการทรัพย์สิน (ส่วนกลางถือครอง)'}
                </span>

                {/* ปุ่มสลับรูปแบบการแสดงผลเฉพาะแท็บ "รายบุคคล" */}
                {viewMode === 'person' && (
                  <div style={{ display: 'flex', background: '#fce7f3', borderRadius: '6px', padding: '2px', border: '1px solid #18181b' }}>
                    <button
                      onClick={() => setPersonDisplayFormat('cards')}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        backgroundColor: personDisplayFormat === 'cards' ? '#18181b' : 'transparent',
                        color: personDisplayFormat === 'cards' ? '#ffffff' : '#09090b'
                      }}
                    >
                      🎴 การ์ดพนักงาน
                    </button>
                    <button
                      onClick={() => setPersonDisplayFormat('table')}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        backgroundColor: personDisplayFormat === 'table' ? '#18181b' : 'transparent',
                        color: personDisplayFormat === 'table' ? '#ffffff' : '#09090b'
                      }}
                    >
                      📋 ตาราง
                    </button>
                  </div>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button 
                  onClick={handleOpenAddModal}
                  style={{
                    backgroundColor: '#18181b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                >
                  ➕ เพิ่มทรัพย์สิน
                </button>

                <button className="btn-export" onClick={exportToCSV} style={{ backgroundColor: '#fce7f3', color: '#18181b', border: '1px solid #18181b', fontWeight: 600 }}>
                  📥 Export CSV
                </button>

                <select 
                  style={{ width: '150px', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '12px', outline: 'none', cursor: 'pointer', backgroundColor: '#ffffff', color: '#09090b', fontWeight: 600 }}
                  value={selectedDept}
                  onChange={handleDeptChange}
                >
                  <option value="">ทุกแผนก ({deptList.length})</option>
                  <option value="__UNASSIGNED__">⚠️ ไม่ระบุแผนก</option>
                  {deptList.map((dept, idx) => (
                    <option key={idx} value={dept}>{dept}</option>
                  ))}
                </select>

                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder="ค้นหา Asset No, ชื่อคน..." 
                    value={searchTerm}
                    onChange={handleSearchChange}
                    style={{ borderColor: '#18181b' }}
                  />
                </div>
              </div>
            </div>

            {/* 🎴 CASE 1: แสดงแบบ "การ์ดพนักงาน" */}
            {viewMode === 'person' && personDisplayFormat === 'cards' ? (
              <div>
                {loading ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#18181b' }}>กำลังดึงข้อมูล...</div>
                ) : groupedPersons.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#18181b' }}>ไม่พบรายชื่อพนักงานตามตัวกรอง</div>
                ) : (
                  <div className="person-cards-grid">
                    {groupedPersons.map((person, pIdx) => (
                      <div key={pIdx} className="person-card" style={{ borderColor: '#18181b', backgroundColor: '#fdf4ff' }}>
                        
                        {/* Header การ์ดคน */}
                        <div className="person-card-header">
                          <div className="person-avatar-info">
                            <div className="person-avatar" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>
                              {person.isResigned ? '🔴' : '👤'}
                            </div>
                            <div>
                              <div className="person-name" style={{ color: person.isResigned ? '#dc2626' : '#09090b', fontWeight: 700 }}>
                                {person.name}
                              </div>
                              <div className="person-dept-tag" style={{ color: '#52525b' }}>แผนก: {person.dept}</div>
                            </div>
                          </div>
                          <span className="asset-count-badge" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>{person.assets.length} ชิ้นในมือ</span>
                        </div>

                        {/* รายการอุปกรณ์ย่อยที่คนนี้ถืออยู่ */}
                        <div className="person-asset-list">
                          {person.assets.map((asset, aIdx) => {
                            const ageInfo = getAssetAgeInfo(asset)
                            const icon = getAssetTypeIcon(asset.type)

                            return (
                              <div 
                                key={aIdx} 
                                className="person-asset-item"
                                onClick={() => setSelectedAsset(asset)}
                                style={{ cursor: 'pointer', backgroundColor: '#ffffff', borderColor: '#e4e4e7' }}
                              >
                                <div className="asset-item-left">
                                  <div className="asset-type-icon">{icon}</div>
                                  <div className="asset-details">
                                    <span className="asset-item-name" style={{ color: '#09090b', fontWeight: 600 }}>{asset.asset_name || 'อุปกรณ์ไอที'}</span>
                                    <div className="asset-item-sub">
                                      <span className="asset-tag" style={{ fontSize: '10px', padding: '1px 5px', backgroundColor: '#18181b', color: '#ffffff' }}>{asset.asset_no || '-'}</span>
                                      <span className={`age-badge ${ageInfo.badgeClass}`}>
                                        {ageInfo.label}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="action-group" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className="btn-icon-return"
                                    onClick={() => handleOpenReturnModal(asset)}
                                    title="คืนเข้าส่วนกลาง (พนักงานลาออก)"
                                    style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: '#fce7f3', color: '#18181b', border: '1px solid #18181b' }}
                                  >
                                    🔄 คืน
                                  </button>
                                  <button
                                    className="btn-icon-action"
                                    onClick={() => handleOpenEditModal(asset)}
                                    title="แก้ไข"
                                    style={{ width: '24px', height: '24px', fontSize: '11px' }}
                                  >
                                    ✏️
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* 📋 CASE 2: แสดงแบบ "ตารางดั้งเดิม" */
              <div className="table-responsive">
                {loading ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#18181b' }}>กำลังดึงข้อมูล...</div>
                ) : displayedAssets.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#18181b' }}>ไม่พบข้อมูลตามคำค้นหา/ตัวกรอง</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr style={{ backgroundColor: '#18181b' }}>
                        <th style={{ width: '120px', color: '#ffffff' }}>Asset No</th>
                        <th style={{ color: '#ffffff' }}>ชื่ออุปกรณ์</th>
                        <th style={{ color: '#ffffff' }}>ผู้ถือครอง (Smart Detect)</th>
                        <th style={{ width: '110px', color: '#ffffff' }}>ลักษณะถือครอง</th>
                        <th style={{ width: '90px', color: '#ffffff' }}>ประเภท</th>
                        <th style={{ width: '80px', color: '#ffffff' }}>แผนก</th>
                        <th style={{ textAlign: 'right', width: '120px', color: '#ffffff' }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedAssets.map((item, index) => {
                        const { realHolder, holderType, isResigned } = getRealAssetHolder(item)

                        return (
                          <tr 
                            key={index} 
                            onClick={() => setSelectedAsset(item)}
                            style={{ backgroundColor: isResigned ? '#fff1f2' : 'transparent', borderBottom: '1px solid #f4f4f5' }}
                          >
                            <td>
                              <span className="asset-tag" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>{item.asset_no || '-'}</span>
                            </td>

                            <td style={{ fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#09090b' }}>
                              {item.asset_name || '-'}
                            </td>
                            
                            <td>
                              <span style={{ color: isResigned ? '#e11d48' : '#09090b', fontWeight: isResigned ? 700 : 600 }}>
                                {realHolder}
                              </span>
                              {isResigned && (
                                <span style={{
                                  backgroundColor: '#18181b',
                                  color: '#f43f5e',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  marginLeft: '6px'
                                }}>
                                  🔴 ลาออก/สูญหาย
                                </span>
                              )}
                            </td>

                            <td>
                              {holderType === 'PERSON' ? (
                                <span className="pill-badge" style={{ backgroundColor: '#fce7f3', color: '#18181b', border: '1px solid #18181b', fontWeight: 600 }}>👤 บุคคล</span>
                              ) : (
                                <span className="pill-badge" style={{ backgroundColor: '#f3e8ff', color: '#18181b', border: '1px solid #18181b', fontWeight: 600 }}>🏢 ส่วนกลาง</span>
                              )}
                            </td>

                            <td><span className="pill-badge" style={{ backgroundColor: '#fae8ff', color: '#86198f', fontWeight: 600 }}>{item.type || '-'}</span></td>
                            <td><span className="pill-badge" style={{ backgroundColor: '#fdf4ff', color: '#701a75', fontWeight: 600 }}>{item.dept || '-'}</span></td>
                            
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="action-group">
                                {holderType === 'PERSON' && (
                                  <button
                                    className="btn-icon-return"
                                    onClick={() => handleOpenReturnModal(item)}
                                    title="รับคืนเข้าส่วนกลาง (พนักงานลาออก)"
                                    style={{ backgroundColor: '#fce7f3', color: '#18181b', border: '1px solid #18181b' }}
                                  >
                                    🔄 คืนเข้าส่วนกลาง
                                  </button>
                                )}

                                <button
                                  className="btn-icon-action"
                                  onClick={() => handleOpenEditModal(item)}
                                  title="แก้ไขรายการนี้"
                                >
                                  ✏️
                                </button>

                                <button
                                  className="btn-icon-action"
                                  onClick={() => handleDeleteAsset(item)}
                                  title="ลบรายการนี้"
                                  style={{ color: '#ef4444' }}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Pagination Footer */}
            {(viewMode !== 'person' || personDisplayFormat === 'table') && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #18181b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                <span style={{ fontSize: '12px', color: '#18181b', fontWeight: 600 }}>
                  หน้า {currentPage} จาก {totalPages} (รวม {totalFilteredCount.toLocaleString()} รายการ)
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={currentPage === 1 || loading}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #18181b', backgroundColor: currentPage === 1 ? '#faf5ff' : '#18181b', color: currentPage === 1 ? '#a1a1aa' : '#ffffff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                  >
                    ◀ ก่อนหน้า
                  </button>
                  <button
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #18181b', backgroundColor: currentPage >= totalPages ? '#faf5ff' : '#18181b', color: currentPage >= totalPages ? '#a1a1aa' : '#ffffff', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                  >
                    ถัดไป ▶
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Right Summary Panel */}
          <div className="panel-card" style={{ backgroundColor: '#ffffff', border: '1px solid #18181b' }}>
            <div className="panel-header" style={{ borderBottom: '1px solid #18181b' }}>
              <span className="panel-title" style={{ color: '#09090b', fontWeight: 800 }}>📊 ทรัพย์สินบริษัท</span>
              <span style={{ fontSize: '11px', color: '#52525b', fontWeight: 600 }}>💡 หมวดหมู่</span>
            </div>
            
            <div className="summary-list">
              {summary.map((item, index) => {
                const totalCountForCalc = allRawAssets.length || 1
                const percentage = Math.round((item.total_count / totalCountForCalc) * 100)
                const icon = getAssetTypeIcon(item.asset_type)

                return (
                  <div 
                    key={index} 
                    className="summary-item"
                    onClick={() => {
                      setSelectedCategoryModal(item.asset_type)
                      setCategorySearch('')
                    }}
                    style={{
                      cursor: 'pointer',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease',
                      border: '1px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fdf4ff'
                      e.currentTarget.style.borderColor = '#18181b'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.borderColor = 'transparent'
                    }}
                    title={`คลิกเพื่อดูรายละเอียดรายการ ${item.asset_type}`}
                  >
                    <div className="summary-info">
                      <span className="summary-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{icon}</span>
                        <strong style={{ color: '#09090b' }}>{item.asset_type}</strong>
                      </span>
                      <span className="summary-count" style={{ color: '#18181b', fontWeight: 700 }}>
                        {item.total_count} ตัว ({percentage}%) 🔍
                      </span>
                    </div>
                    <div className="progress-bar-bg" style={{ marginTop: '6px', backgroundColor: '#e4e4e7' }}>
                      <div className="progress-bar-fill" style={{ width: `${percentage < 2 ? 2 : percentage}%`, background: 'linear-gradient(90deg, #18181b, #f472b6)' }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </main>

      {/* 🔄 Modal สำหรับการรับคืนทรัพย์สินเข้าส่วนกลาง (ระบุแผนกได้) */}
      {returningAsset && (
        <div className="modal-overlay" onClick={() => setReturningAsset(null)}>
          <div className="modal-card" style={{ maxWidth: '520px', border: '2px solid #18181b' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #18181b' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#09090b' }}>
                🔄 รับคืนทรัพย์สินเข้าส่วนกลาง / ย้ายสังกัด
              </span>
              <button 
                onClick={() => setReturningAsset(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#18181b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={executeReturnToStock}>
              <div className="modal-body" style={{ padding: '16px 20px' }}>
                <div style={{ backgroundColor: '#fdf4ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #18181b', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#09090b' }}>
                    {returningAsset.asset_name || 'อุปกรณ์ไอที'} ({returningAsset.asset_no || 'ไม่ระบุ Asset No'})
                  </div>
                  <div style={{ fontSize: '12px', color: '#be185d', marginTop: '2px' }}>
                    ผู้ถือครองเดิม: <strong>{getRealAssetHolder(returningAsset).realHolder}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>ย้ายไปอยู่แผนก (Department) *</label>
                    <select
                      value={returnFormData.dept}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, dept: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px', backgroundColor: '#fff' }}
                      required
                    >
                      <option value="แผนกสารสนเทศ">แผนกสารสนเทศ (IT)</option>
                      <option value="ส่วนกลาง">ส่วนกลางบริษัท</option>
                      {deptList.map((d, i) => (
                        <option key={i} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>ผู้ถือครองใหม่ (Owner / Holder)</label>
                    <input 
                      type="text" 
                      value={returnFormData.owner}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, owner: e.target.value }))}
                      placeholder="เช่น ส่วนกลาง, แผนกสารสนเทศ (ส่วนกลาง)"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>สถานที่จัดเก็บใหม่ (Location)</label>
                    <input 
                      type="text" 
                      value={returnFormData.location}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="เช่น ห้องเก็บของ IT ชั้น 3, คลังสินค้า"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>หมายเหตุการรับคืน (Remark)</label>
                    <textarea 
                      value={returnFormData.remark}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, remark: e.target.value }))}
                      rows="2"
                      placeholder="ระบุเหตุผล เช่น รับคืนเนื่องจากพนักงานลาออก..."
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px', resize: 'vertical' }}
                    ></textarea>
                  </div>

                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #18181b' }}>
                <button 
                  type="button"
                  onClick={() => setReturningAsset(null)}
                  style={{ padding: '6px 14px', backgroundColor: '#ffffff', color: '#18181b', border: '1px solid #18181b', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  style={{ padding: '6px 16px', backgroundColor: '#18181b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                >
                  {loading ? 'กำลังบันทึก...' : 'ย้าย/รับคืนอุปกรณ์'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📊 Modal แสดงรายละเอียดทรัพย์สินแยกตามหมวดหมู่ */}
      {selectedCategoryModal && (() => {
        const categoryItems = allRawAssets.filter(item => {
          const itemType = (item.type || '').toUpperCase().trim()
          const targetType = selectedCategoryModal.toUpperCase().trim()
          return itemType === targetType || itemType.includes(targetType) || targetType.includes(itemType)
        })

        const filteredCategoryItems = categoryItems.filter(item => {
          if (!categorySearch.trim()) return true
          const term = categorySearch.toLowerCase().trim()
          const { realHolder, realLocation } = getRealAssetHolder(item)
          return `${JSON.stringify(item)} ${realHolder} ${realLocation}`.toLowerCase().includes(term)
        })

        const categoryIcon = getAssetTypeIcon(selectedCategoryModal)

        return (
          <div className="modal-overlay" onClick={() => setSelectedCategoryModal(null)}>
            <div className="modal-card" style={{ maxWidth: '850px', width: '92%', border: '2px solid #18181b' }} onClick={(e) => e.stopPropagation()}>
              
              <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid #18181b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>{categoryIcon}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#09090b' }}>
                        รายละเอียดหมวดหมู่: {selectedCategoryModal}
                      </h3>
                      <span className="pill-badge" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#18181b', color: '#ffffff' }}>
                        {categoryItems.length} รายการในระบบ
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#52525b' }}>
                      รายการอุปกรณ์ทั้งหมดที่มีการลงทะเบียนอยู่ในหมวดหมู่นี้
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCategoryModal(null)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#18181b' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '12px 20px', backgroundColor: '#fdf4ff', borderBottom: '1px solid #18181b', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="search-box" style={{ width: '280px' }}>
                  <input 
                    type="text" 
                    placeholder={`ค้นหาใน ${selectedCategoryModal} (รหัส, ชื่อ, ผู้ถือ)...`}
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 12px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '12px' }}
                  />
                </div>
                <span style={{ fontSize: '12px', color: '#09090b', fontWeight: 600 }}>
                  แสดงผล <strong>{filteredCategoryItems.length}</strong> จาก {categoryItems.length} รายการ
                </span>
              </div>

              <div className="modal-body" style={{ maxHeight: '55vh', overflowY: 'auto', padding: '0' }}>
                {filteredCategoryItems.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#18181b' }}>
                    ไม่พบรายการอุปกรณ์ตรงกับคำค้นหา "{categorySearch}"
                  </div>
                ) : (
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#18181b', zIndex: 1 }}>
                      <tr>
                        <th style={{ width: '110px', color: '#ffffff' }}>Asset No</th>
                        <th style={{ color: '#ffffff' }}>ชื่ออุปกรณ์ / ยี่ห้อรุ่น</th>
                        <th style={{ color: '#ffffff' }}>แผนก</th>
                        <th style={{ color: '#ffffff' }}>ผู้ถือครอง ( Smart Detect )</th>
                        <th style={{ width: '100px', color: '#ffffff' }}>อายุอุปกรณ์</th>
                        <th style={{ textAlign: 'right', width: '90px', color: '#ffffff' }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategoryItems.map((item, idx) => {
                        const { realHolder, isResigned } = getRealAssetHolder(item)
                        const ageInfo = getAssetAgeInfo(item)

                        return (
                          <tr key={idx} style={{ backgroundColor: isResigned ? '#fff1f2' : 'transparent', borderBottom: '1px solid #e4e4e7' }}>
                            <td>
                              <span className="asset-tag" style={{ fontSize: '11px', backgroundColor: '#18181b', color: '#ffffff' }}>{item.asset_no || '-'}</span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: '#09090b', fontSize: '13px' }}>{item.asset_name || '-'}</div>
                              <div style={{ fontSize: '11px', color: '#52525b' }}>
                                {[item.brand, item.model].filter(Boolean).join(' ') || '-'}
                              </div>
                            </td>
                            <td>
                              <span className="pill-badge" style={{ fontSize: '11px', backgroundColor: '#fae8ff', color: '#86198f', fontWeight: 600 }}>{item.dept || '-'}</span>
                            </td>
                            <td>
                              <span style={{ color: isResigned ? '#e11d48' : '#09090b', fontWeight: isResigned ? 700 : 600, fontSize: '13px' }}>
                                {realHolder}
                              </span>
                            </td>
                            <td>
                              <span className={`age-badge ${ageInfo.badgeClass}`} style={{ fontSize: '10px' }}>
                                {ageInfo.label}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="action-group" style={{ justifyContent: 'flex-end' }}>
                                <button
                                  className="btn-icon-action"
                                  onClick={() => setSelectedAsset(item)}
                                  title="ดูรายละเอียดข้อมูลฉบับเต็ม"
                                  style={{ padding: '3px 6px', fontSize: '11px', backgroundColor: '#18181b', color: '#ffffff' }}
                                >
                                  👁️ ดูข้อมูล
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #18181b', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setSelectedCategoryModal(null)}
                  style={{ padding: '6px 16px', backgroundColor: '#18181b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  ปิดหน้าต่าง
                </button>
              </div>

            </div>
          </div>
        )
      })()}

      {/* 📝 Modal Form สำหรับ เพิ่ม / แก้ไข ทรัพย์สิน */}
      {isFormOpen && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ border: '2px solid #18181b' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #18181b' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#09090b' }}>
                {editingAsset ? '✏️ แก้ไขข้อมูลทรัพย์สิน' : '➕ เพิ่มทรัพย์สินใหม่'}
              </span>
              <button 
                onClick={() => setIsFormOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#18181b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  
                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>เลขทรัพย์สิน (Asset No)</label>
                    <input 
                      type="text" 
                      name="asset_no"
                      value={formData.asset_no}
                      onChange={handleFormChange}
                      placeholder="เช่น C08-01-0005/59"
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>ประเภท (Type) *</label>
                    <input 
                      type="text" 
                      name="type"
                      value={formData.type}
                      onChange={handleFormChange}
                      placeholder="เช่น NB, MONITOR, AIO"
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                      required
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>ชื่ออุปกรณ์ (Asset Name) *</label>
                    <input 
                      type="text" 
                      name="asset_name"
                      value={formData.asset_name}
                      onChange={handleFormChange}
                      placeholder="เช่น DELL LATITUDE 3420"
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                      required
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>ยี่ห้อ (Brand)</label>
                    <input 
                      type="text" 
                      name="brand"
                      value={formData.brand}
                      onChange={handleFormChange}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>รุ่น (Model)</label>
                    <input 
                      type="text" 
                      name="model"
                      value={formData.model}
                      onChange={handleFormChange}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>แผนก (Department)</label>
                    <input 
                      type="text" 
                      name="dept"
                      value={formData.dept}
                      onChange={handleFormChange}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>ผู้ถือครอง / ผู้ใช้งาน</label>
                    <input 
                      type="text" 
                      name="owner"
                      value={formData.owner}
                      onChange={handleFormChange}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>สถานที่ตั้ง (Location)</label>
                    <input 
                      type="text" 
                      name="location"
                      value={formData.location}
                      onChange={handleFormChange}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="detail-label" style={{ color: '#09090b', fontWeight: 600 }}>หมายเหตุ (Remark)</label>
                    <textarea 
                      name="Remark"
                      value={formData.Remark}
                      onChange={handleFormChange}
                      rows="2"
                      placeholder="ระบุหมายเหตุ เช่น พนักงานลาออก, เครื่องสูญหาย..."
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #18181b', borderRadius: '6px', fontSize: '13px', marginTop: '4px', resize: 'vertical' }}
                    ></textarea>
                  </div>

                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #18181b' }}>
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  style={{ padding: '6px 14px', backgroundColor: '#ffffff', color: '#18181b', border: '1px solid #18181b', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '6px 16px', backgroundColor: '#18181b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📋 Modal แสดงรายละเอียดทรัพย์สินฉบับเต็ม */}
      {selectedAsset && (
        <div className="modal-overlay" onClick={() => setSelectedAsset(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ border: '2px solid #18181b' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #18181b' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#09090b' }}>📋 รายละเอียดทรัพย์สิน</span>
              <button 
                onClick={() => setSelectedAsset(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#18181b' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <div className="detail-grid">
                {Object.entries(selectedAsset).map(([key, value], idx) => {
                  const isRemark = key.toLowerCase() === 'remark'
                  return (
                    <div key={idx} className="detail-item" style={{ gridColumn: String(value).length > 30 ? 'span 2' : 'span 1' }}>
                      <span className="detail-label" style={{ color: '#52525b', fontWeight: 600 }}>{key}</span>
                      <span className="detail-value" style={{ color: isRemark && (String(value).includes('พนักงานลาออก') || String(value).includes('สูญหาย')) ? '#e11d48' : '#09090b', fontWeight: 600 }}>
                        {value !== null && value !== '' ? String(value) : '-'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #18181b' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {getRealAssetHolder(selectedAsset).holderType === 'PERSON' && (
                  <button 
                    onClick={() => handleOpenReturnModal(selectedAsset)}
                    className="btn-icon-return"
                    style={{ backgroundColor: '#fce7f3', color: '#18181b', border: '1px solid #18181b' }}
                  >
                    🔄 คืนเข้าส่วนกลาง
                  </button>
                )}

                <button 
                  onClick={() => handleOpenEditModal(selectedAsset)}
                  className="btn-icon-action"
                  style={{ width: 'auto', padding: '0 10px', fontSize: '12px' }}
                >
                  ✏️ แก้ไข
                </button>
                
                <button 
                  onClick={() => handleDeleteAsset(selectedAsset)}
                  className="btn-icon-action"
                  style={{ width: 'auto', padding: '0 10px', fontSize: '12px', color: '#ef4444' }}
                >
                  🗑️ ลบ
                </button>
              </div>

              <button 
                onClick={() => setSelectedAsset(null)}
                style={{ padding: '6px 14px', backgroundColor: '#18181b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App