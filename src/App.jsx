import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
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

// ⏳ คำนวณอายุอุปกรณ์
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
  // 🔐 Auth & Permission States
  const [session, setSession] = useState(null)
  const [userRole, setUserRole] = useState('viewer')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // ⚙️ Settings & User Management States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [profilesList, setProfilesList] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  // 📦 Asset System States
  const [allRawAssets, setAllRawAssets] = useState([])
  const [displayedAssets, setDisplayedAssets] = useState([])
  const [summary, setSummary] = useState([])
  const [deptList, setDeptList] = useState([])
  const [loading, setLoading] = useState(true)

  const [currentDateTime, setCurrentDateTime] = useState('')

  const [viewMode, setViewMode] = useState('all')
  const [personDisplayFormat, setPersonDisplayFormat] = useState('cards')
  const [selectedAsset, setSelectedAsset] = useState(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [returningAsset, setReturningAsset] = useState(null)
  const [returnFormData, setReturnFormData] = useState({
    dept: 'แผนกสารสนเทศ',
    owner: 'ส่วนกลาง',
    location: 'ห้องเก็บของ IT',
    remark: ''
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalFilteredCount, setTotalFilteredCount] = useState(0)

  // 🕒 นาฬิกาและวันที่
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

  // 🔐 ระบบ Auth เช็ก Session & Role อัตโนมัติ
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUserRole(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchUserRole(session.user.id)
      else setUserRole('viewer')
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      loadAllData()
    }
  }, [session])

  useEffect(() => {
    if (session) {
      applyFiltersAndPagination()
    }
  }, [searchTerm, selectedDept, selectedCategory, viewMode, currentPage, allRawAssets, session])

  async function fetchUserRole(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      if (data && data.role) {
        setUserRole(data.role.toLowerCase())
      } else {
        setUserRole('viewer')
      }
    } catch (err) {
      console.error('Fetch role error:', err)
      setUserRole('viewer')
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (error) {
      alert('เข้าสู่ระบบไม่สำเร็จ: ' + error.message)
    }
    setAuthLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // ⚙️ โหลดรายชื่อผู้ใช้งานทั้งหมด
  async function loadProfilesList() {
    setLoadingProfiles(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('email', { ascending: true })

      if (error) throw error
      setProfilesList(data || [])
    } catch (err) {
      console.error('Fetch profiles error:', err)
    } finally {
      setLoadingProfiles(false)
    }
  }

  // ➕ ฟังก์ชันสร้าง User ใหม่สิทธิ์ Viewer
  async function handleAddViewerUser(e) {
    e.preventDefault()
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      alert('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน')
      return
    }

    if (newUserPassword.length < 6) {
      alert('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร')
      return
    }

    setAddingUser(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || supabase.supabaseUrl
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || supabase.supabaseKey

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
      const { error } = await tempClient.auth.signUp({
        email: newUserEmail.trim(),
        password: newUserPassword.trim(),
      })

      if (error) throw error

      alert(`เพิ่มผู้ใช้งาน "${newUserEmail}" สิทธิ์ Viewer เรียบร้อยแล้ว!`)
      setNewUserEmail('')
      setNewUserPassword('')
      loadProfilesList()
    } catch (err) {
      console.error('Error adding user:', err)
      alert('เกิดข้อผิดพลาดในการเพิ่มผู้ใช้งาน: ' + err.message)
    } finally {
      setAddingUser(false)
    }
  }

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }

  const handleDeptChange = (e) => {
    setSelectedDept(e.target.value)
    setCurrentPage(1)
  }

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value)
    setCurrentPage(1)
  }

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    setCurrentPage(1)
  }

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

    if (selectedCategory !== '') {
      const catTarget = selectedCategory.toUpperCase().trim()
      result = result.filter(item => {
        const itemType = (item.type || '').toUpperCase().trim()
        return itemType === catTarget || itemType.includes(catTarget) || catTarget.includes(itemType)
      })
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

  function getGroupedPersonAssets() {
    const personMap = {}
    let filteredPersonAssets = allRawAssets.filter(item => getRealAssetHolder(item).holderType === 'PERSON')

    if (selectedDept === '__UNASSIGNED__') {
      filteredPersonAssets = filteredPersonAssets.filter(item => !item.dept || item.dept.trim() === '')
    } else if (selectedDept !== '') {
      filteredPersonAssets = filteredPersonAssets.filter(item => item.dept === selectedDept)
    }

    if (selectedCategory !== '') {
      const catTarget = selectedCategory.toUpperCase().trim()
      filteredPersonAssets = filteredPersonAssets.filter(item => {
        const itemType = (item.type || '').toUpperCase().trim()
        return itemType === catTarget || itemType.includes(catTarget) || catTarget.includes(itemType)
      })
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

  function handleOpenReturnModal(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์ในการดำเนินรายการนี้ (Admin Only)')
      return
    }
    const { realHolder } = getRealAssetHolder(item)
    setReturningAsset(item)
    setReturnFormData({
      dept: 'แผนกสารสนเทศ',
      owner: 'ส่วนกลาง',
      location: 'ห้องเก็บของ IT',
      remark: `[รับคืนพนักงาน] เดิมถือครองโดย: ${realHolder}`
    })
  }

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
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์เพิ่มทรัพย์สิน (Admin Only)')
      return
    }
    setEditingAsset(null)
    setFormData(emptyForm)
    setIsFormOpen(true)
  }

  function handleOpenEditModal(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์แก้ไขข้อมูล (Admin Only)')
      return
    }
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
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์ลบทรัพย์สิน (Admin Only)')
      return
    }
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

  // ----------------------------------------------------
  // 🔑 หน้าจอ Login 30 / 70 ธีมขาวเหลืองมีลวดลายสุภาพ
  // ----------------------------------------------------
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Sarabun, Inter, sans-serif', backgroundColor: '#ffffff' }}>
        
        {/* ฝั่งซ้าย: Enterprise Banner (30%) โทนขาวเหลืองสุภาพ + ลวดลาย Dot Pattern */}
        <div style={{
          flex: '0 0 30%',
          minWidth: '320px',
          backgroundColor: '#fefce8',
          backgroundImage: 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px), linear-gradient(135deg, #fffdf0 0%, #fef3c7 100%)',
          backgroundSize: '20px 20px, 100% 100%',
          color: '#0f172a',
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          boxSizing: 'border-box',
          borderRight: '1px solid #e2e8f0'
        }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#fef3c7', color: '#92400e', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
              <span>🛡️</span> Enterprise Asset Management
            </div>
            
            <h1 style={{ fontSize: '24px', fontWeight: 600, marginTop: '28px', marginBottom: '12px', lineHeight: 1.35, letterSpacing: '-0.3px', color: '#0f172a' }}>
              ระบบบริหารจัดการ<br />ทรัพย์สินไอทีระดับองค์กร
            </h1>
            
            <p style={{ color: '#475569', fontSize: '13px', lineHeight: 1.6, fontWeight: 400 }}>
              ศูนย์กลางควบคุม ตรวจสอบ และติดตามสถานะอุปกรณ์ไอทีทุกประเภท พร้อมระบบ Smart Detect จำแนกผู้ถือครองอัตโนมัติ
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255, 255, 255, 0.75)', padding: '10px 12px', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>📦</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Smart Asset Detection</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>จำแนกผู้ถือครองและแผนกอัตโนมัติ</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255, 255, 255, 0.75)', padding: '10px 12px', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>🔑</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Role-Based Access</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>แยกสิทธิ์ Admin และ Viewer</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255, 255, 255, 0.75)', padding: '10px 12px', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>⚡</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Real-Time Tracking</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>ค้นหารวดเร็วและ Export CSV ได้ง่าย</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', borderTop: '1px solid #cbd5e1', paddingTop: '14px' }}>
            © {new Date().getFullYear()} IT Asset Management System.
          </div>
        </div>

        {/* ฝั่งขวา: Login Form (70%) */}
        <div style={{
          flex: '1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          backgroundColor: '#f8fafc',
          boxSizing: 'border-box'
        }}>
          <div style={{ width: '100%', maxWidth: '380px', backgroundColor: '#ffffff', padding: '36px 32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#f1f5f9', color: '#0f172a', borderRadius: '6px', fontWeight: 500, padding: '3px 8px', fontSize: '12px', display: 'inline-block', marginBottom: '10px' }}>
                IT Portal
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0f172a', margin: 0 }}>เข้าสู่ระบบบริหารทรัพย์สิน</h2>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>ระบุอีเมลและรหัสผ่านเพื่อเข้าใช้งานระบบ</p>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>อีเมล (Email)</label>
                <input 
                  type="email" 
                  value={loginEmail} 
                  onChange={e => setLoginEmail(e.target.value)} 
                  placeholder="name@company.com" 
                  required 
                  style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>รหัสผ่าน (Password)</label>
                <input 
                  type="password" 
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required 
                  style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
                />
              </div>

              <button 
                type="submit" 
                disabled={authLoading} 
                style={{ 
                  width: '100%', 
                  height: '36px',
                  backgroundColor: '#0f172a', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  fontSize: '13px', 
                  fontWeight: 500, 
                  marginTop: '8px',
                  boxShadow: '0 2px 4px rgba(15, 23, 42, 0.15)',
                  transition: 'background-color 0.2s'
                }}
              >
                {authLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE) || 1
  const groupedPersons = getGroupedPersonAssets()

  // ----------------------------------------------------
  // 🖥️ หน้าจอหลักเมื่อเข้าสู่ระบบเรียบร้อยแล้ว
  // ----------------------------------------------------
  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'Sarabun, Inter, sans-serif', color: '#0f172a' }}>
      
      {/* Top Navbar */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '6px', fontWeight: 600, padding: '4px 8px', fontSize: '13px' }}>IT</div>
          <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '16px', letterSpacing: '-0.2px' }}>IT Asset Management System</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', padding: '4px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', height: '32px', boxSizing: 'border-box' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></span>
            <span style={{ fontWeight: 500, color: '#0f172a', fontSize: '12px' }}>
              {currentDateTime || '📅 กำลังโหลดเวลา...'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
            <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 500 }}>
              👤 {session.user.email}
            </span>
            <span style={{ 
              fontSize: '11px', 
              padding: '3px 8px', 
              borderRadius: '4px', 
              backgroundColor: userRole === 'admin' ? '#fef3c7' : '#f1f5f9',
              color: userRole === 'admin' ? '#92400e' : '#475569',
              fontWeight: 600 
            }}>
              {userRole === 'admin' ? '🛡️ ADMIN' : '👁️ VIEWER'}
            </span>

            {userRole === 'admin' && (
              <button
                onClick={() => {
                  setIsSettingsOpen(true)
                  loadProfilesList()
                }}
                style={{
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  border: 'none',
                  height: '32px',
                  padding: '0 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                ⚙️ ตั้งค่า
              </button>
            )}

            <button 
              onClick={handleLogout}
              style={{ backgroundColor: '#f8fafc', color: '#0f172a', border: 'none', height: '32px', padding: '0 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ padding: '20px 24px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* Page Header */}
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ color: '#0f172a', fontWeight: 600, fontSize: '20px', margin: 0 }}>IT Asset Overview</h1>
          <p style={{ color: '#64748b', fontSize: '13px', fontWeight: 400, margin: '2px 0 0' }}>ระบบบริหารจัดการ ตรวจสอบ และจำแนกผู้ถือครองทรัพย์สินไอทีระดับองค์กร</p>
        </div>

        {/* Top Executive KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>รวมทรัพย์สินไอทีในระบบ</span>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '24px' }}>{allRawAssets.length.toLocaleString()}</span>
                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
              </div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>📦</div>
          </div>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>มุมมองสิทธิ์การครอบครอง</span>
              <div style={{ marginTop: '4px' }}>
                <span style={{ fontSize: '15px', color: '#0f172a', fontWeight: 600 }}>
                  {viewMode === 'all' && 'ทรัพย์สินทั้งหมด'}
                  {viewMode === 'person' && 'ถือครองรายบุคคล'}
                  {viewMode === 'dept' && 'ส่วนกลาง / แผนก'}
                </span>
              </div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>
              {viewMode === 'person' ? '👤' : viewMode === 'dept' ? '🏢' : '🌐'}
            </div>
          </div>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>หมวดหมู่อุปกรณ์ไอที</span>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '24px' }}>{summary.length}</span>
                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>จำพวก</span>
              </div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>🏷️</div>
          </div>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>รายการตรวจพบตามตัวกรอง</span>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '24px' }}>
                  {totalFilteredCount.toLocaleString()}
                </span>
                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
              </div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>🎯</div>
          </div>
        </div>

        {/* Main Panel */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          
          {/* Tabs */}
          <div style={{ padding: '12px 16px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px', backgroundColor: '#f8fafc' }}>
            <button 
              onClick={() => handleViewModeChange('all')}
              style={{
                height: '36px',
                padding: '0 16px',
                borderRadius: '6px 6px 0 0',
                border: 'none',
                borderBottom: viewMode === 'all' ? '2px solid #0f172a' : '2px solid transparent',
                backgroundColor: viewMode === 'all' ? '#ffffff' : 'transparent',
                color: viewMode === 'all' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'all' ? 600 : 500,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              📦 ทั้งหมด ({allRawAssets.length.toLocaleString()})
            </button>

            <button 
              onClick={() => handleViewModeChange('person')}
              style={{
                height: '36px',
                padding: '0 16px',
                borderRadius: '6px 6px 0 0',
                border: 'none',
                borderBottom: viewMode === 'person' ? '2px solid #0f172a' : '2px solid transparent',
                backgroundColor: viewMode === 'person' ? '#ffffff' : 'transparent',
                color: viewMode === 'person' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'person' ? 600 : 500,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              👤 รายบุคคลถือครอง
            </button>

            <button 
              onClick={() => handleViewModeChange('dept')}
              style={{
                height: '36px',
                padding: '0 16px',
                borderRadius: '6px 6px 0 0',
                border: 'none',
                borderBottom: viewMode === 'dept' ? '2px solid #0f172a' : '2px solid transparent',
                backgroundColor: viewMode === 'dept' ? '#ffffff' : 'transparent',
                color: viewMode === 'dept' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'dept' ? 600 : 500,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              🏢 รายแผนก / ส่วนกลางถือครอง
            </button>
          </div>

          {/* Controls Bar - Standardized 36px Height */}
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '15px' }}>
                {viewMode === 'all' && 'รายการทรัพย์สินทั้งหมด'}
                {viewMode === 'person' && `โปรไฟล์การถือครองรายบุคคล (${groupedPersons.length} คน)`}
                {viewMode === 'dept' && 'รายการทรัพย์สิน (ส่วนกลางถือครอง)'}
              </span>

              {viewMode === 'person' && (
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '6px', padding: '2px' }}>
                  <button
                    onClick={() => setPersonDisplayFormat('cards')}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      backgroundColor: personDisplayFormat === 'cards' ? '#ffffff' : 'transparent',
                      color: personDisplayFormat === 'cards' ? '#0f172a' : '#64748b',
                      boxShadow: personDisplayFormat === 'cards' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    🎴 การ์ด
                  </button>
                  <button
                    onClick={() => setPersonDisplayFormat('table')}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      backgroundColor: personDisplayFormat === 'table' ? '#ffffff' : 'transparent',
                      color: personDisplayFormat === 'table' ? '#0f172a' : '#64748b',
                      boxShadow: personDisplayFormat === 'table' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    📋 ตาราง
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              
              {userRole === 'admin' && (
                <button 
                  onClick={handleOpenAddModal}
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    height: '36px',
                    padding: '0 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxSizing: 'border-box'
                  }}
                >
                  ➕ เพิ่มทรัพย์สิน
                </button>
              )}

              <button 
                onClick={exportToCSV} 
                style={{ 
                  backgroundColor: '#f8fafc', 
                  color: '#0f172a', 
                  border: '1px solid #e2e8f0', 
                  fontWeight: 500, 
                  borderRadius: '6px', 
                  height: '36px',
                  padding: '0 16px', 
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxSizing: 'border-box'
                }}
              >
                📥 Export CSV
              </button>

              <select
                style={{
                  height: '36px',
                  padding: '0 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  fontWeight: 500,
                  boxSizing: 'border-box'
                }}
                value={selectedCategory}
                onChange={handleCategoryChange}
              >
                <option value="">🏷️ ทุกหมวดหมู่ ({summary.length})</option>
                {summary.map((cat, idx) => (
                  <option key={idx} value={cat.asset_type}>
                    {getAssetTypeIcon(cat.asset_type)} {cat.asset_type} ({cat.total_count})
                  </option>
                ))}
              </select>

              <select 
                style={{ 
                  height: '36px',
                  padding: '0 12px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '6px', 
                  fontSize: '13px', 
                  outline: 'none', 
                  cursor: 'pointer', 
                  backgroundColor: '#f8fafc', 
                  color: '#0f172a', 
                  fontWeight: 500,
                  boxSizing: 'border-box'
                }}
                value={selectedDept}
                onChange={handleDeptChange}
              >
                <option value="">🏢 ทุกแผนก ({deptList.length})</option>
                <option value="__UNASSIGNED__">⚠️ ไม่ระบุแผนก</option>
                {deptList.map((dept, idx) => (
                  <option key={idx} value={dept}>{dept}</option>
                ))}
              </select>

              <input 
                type="text" 
                placeholder="ค้นหา Asset No, ชื่อคน..." 
                value={searchTerm}
                onChange={handleSearchChange}
                style={{ 
                  height: '36px',
                  width: '220px',
                  border: '1px solid #e2e8f0', 
                  borderRadius: '6px', 
                  padding: '0 12px', 
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  color: '#0f172a',
                  fontWeight: 400,
                  backgroundColor: '#f8fafc',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* 🎴 CASE 1: การ์ดพนักงาน */}
          {viewMode === 'person' && personDisplayFormat === 'cards' ? (
            <div style={{ padding: '16px' }}>
              {loading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>กำลังดึงข้อมูล...</div>
              ) : groupedPersons.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>ไม่พบรายชื่อพนักงานตามตัวกรอง</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {groupedPersons.map((person, pIdx) => (
                    <div key={pIdx} style={{ border: '1px solid #e2e8f0', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: person.isResigned ? '#dc2626' : '#0f172a', fontWeight: 600, fontSize: '14px' }}>{person.name}</div>
                          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>แผนก: {person.dept}</div>
                        </div>
                        <span style={{ backgroundColor: '#f1f5f9', color: '#0f172a', borderRadius: '12px', fontSize: '11px', padding: '2px 8px', fontWeight: 600 }}>{person.assets.length} ชิ้น</span>
                      </div>

                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {person.assets.map((asset, aIdx) => {
                          const ageInfo = getAssetAgeInfo(asset)
                          const icon = getAssetTypeIcon(asset.type)

                          return (
                            <div 
                              key={aIdx} 
                              onClick={() => setSelectedAsset(asset)}
                              style={{ cursor: 'pointer', backgroundColor: '#f8fafc', borderRadius: '6px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                <span style={{ fontSize: '16px' }}>{icon}</span>
                                <div style={{ overflow: 'hidden' }}>
                                  <div style={{ color: '#0f172a', fontWeight: 500, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.asset_name || 'อุปกรณ์ไอที'}</div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                    <span style={{ fontSize: '11px', padding: '1px 6px', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: '4px', fontWeight: 500 }}>{asset.asset_no || '-'}</span>
                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>{ageInfo.label}</span>
                                  </div>
                                </div>
                              </div>

                              {userRole === 'admin' && (
                                <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleOpenReturnModal(asset)}
                                    style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                                  >
                                    🔄 คืน
                                  </button>
                                  <button
                                    onClick={() => handleOpenEditModal(asset)}
                                    style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    ✏️
                                  </button>
                                </div>
                              )}
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
            /* 📋 CASE 2: ตารางมาตรฐานสมดุลสากล (Symmetrical Table, No Clipped Buttons) */
            <div style={{ overflowX: 'auto', width: '100%' }}>
              {loading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>กำลังดึงข้อมูล...</div>
              ) : displayedAssets.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>ไม่พบข้อมูลตามคำค้นหา/ตัวกรอง</div>
              ) : (
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '14px 16px', textAlign: 'left', width: '150px', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ASSET NO</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ชื่ออุปกรณ์</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', width: '220px', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ผู้ถือครอง (SMART DETECT)</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ลักษณะถือครอง</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ประเภท</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', width: '90px', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>แผนก</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', width: '170px', color: '#64748b', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAssets.map((item, index) => {
                      const { realHolder, holderType, isResigned } = getRealAssetHolder(item)

                      return (
                        <tr 
                          key={index} 
                          onClick={() => setSelectedAsset(item)}
                          style={{ backgroundColor: isResigned ? '#fff1f2' : 'transparent', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                        >
                          {/* ASSET NO */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '13px', color: '#0f172a', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                              {item.asset_no || '-'}
                            </span>
                          </td>

                          {/* ชื่ออุปกรณ์ */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 500, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.asset_name || '-'}
                          </td>
                          
                          {/* ผู้ถือครอง */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <span style={{ color: isResigned ? '#e11d48' : '#0f172a', fontWeight: 500, fontSize: '13px' }}>
                                {realHolder}
                              </span>
                              {isResigned && (
                                <span style={{ backgroundColor: '#ffe4e6', color: '#9f1239', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                                  ลาออก
                                </span>
                              )}
                            </div>
                          </td>

                          {/* ลักษณะถือครอง */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {holderType === 'PERSON' ? (
                              <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 600, fontSize: '11px', padding: '4px 10px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                👤 บุคคล
                              </span>
                            ) : (
                              <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 500, fontSize: '11px', padding: '4px 10px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                🏢 ส่วนกลาง
                              </span>
                            )}
                          </td>

                          {/* ประเภท */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#334155', fontWeight: 500, fontSize: '12px' }}>
                              {item.type || '-'}
                            </span>
                          </td>

                          {/* แผนก */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#334155', fontWeight: 500, fontSize: '12px' }}>
                              {item.dept || '-'}
                            </span>
                          </td>
                          
                          {/* ปุ่มจัดการ: มี Slot Placeholder ดักแนวตั้ง ไม่ล้น ไม่เหลื่อม */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            {userRole === 'admin' ? (
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                {holderType === 'PERSON' ? (
                                  <button
                                    onClick={() => handleOpenReturnModal(item)}
                                    title="รับคืนเข้าส่วนกลาง"
                                    style={{
                                      backgroundColor: '#f1f5f9',
                                      color: '#0f172a',
                                      border: 'none',
                                      fontWeight: 600,
                                      fontSize: '11px',
                                      padding: '0 10px',
                                      height: '30px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      whiteSpace: 'nowrap',
                                      boxSizing: 'border-box'
                                    }}
                                  >
                                    🔄 คืน
                                  </button>
                                ) : (
                                  /* ล็อกช่องว่าง 52px สำหรับแถวที่ไม่มีปุ่มคืน ทำให้ปุ่ม แก้ไข/ลบ ตรงกันเป๊ะทุกแถว */
                                  <div style={{ width: '52px', height: '30px' }} />
                                )}

                                <button
                                  onClick={() => handleOpenEditModal(item)}
                                  title="แก้ไข"
                                  style={{
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  ✏️
                                </button>

                                <button
                                  onClick={() => handleDeleteAsset(item)}
                                  title="ลบ"
                                  style={{
                                    backgroundColor: '#fff1f2',
                                    border: 'none',
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    color: '#e11d48',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  🗑️
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>👁️ อ่านอย่างเดียว</span>
                            )}
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
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                หน้า {currentPage} จาก {totalPages} (รวม {totalFilteredCount.toLocaleString()} รายการ)
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  disabled={currentPage === 1 || loading}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  style={{ height: '32px', padding: '0 14px', borderRadius: '6px', border: 'none', backgroundColor: currentPage === 1 ? '#f1f5f9' : '#f8fafc', color: currentPage === 1 ? '#cbd5e1' : '#0f172a', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 500 }}
                >
                  ◀ ก่อนหน้า
                </button>
                <button
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  style={{ height: '32px', padding: '0 14px', borderRadius: '6px', border: 'none', backgroundColor: currentPage >= totalPages ? '#f1f5f9' : '#f8fafc', color: currentPage >= totalPages ? '#cbd5e1' : '#0f172a', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 500 }}
                >
                  ถัดไป ▶
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ⚙️ Modal ตั้งค่า & จัดการผู้ใช้งาน */}
      {isSettingsOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '700px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>⚙️ ตั้งค่าระบบ & จัดการผู้ใช้งาน</span>
              <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              
              <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '10px' }}>
                  ➕ เพิ่มผู้ใช้งานใหม่ (สิทธิ์ Viewer)
                </div>

                <form onSubmit={handleAddViewerUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>อีเมลผู้ใช้ *</label>
                    <input 
                      type="email" 
                      placeholder="user@company.com" 
                      value={newUserEmail} 
                      onChange={e => setNewUserEmail(e.target.value)} 
                      required 
                      style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} 
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>รหัสผ่าน (อย่างน้อย 6 ตัว) *</label>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={newUserPassword} 
                      onChange={e => setNewUserPassword(e.target.value)} 
                      required 
                      style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} 
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={addingUser}
                    style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '0 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, height: '36px' }}
                  >
                    {addingUser ? 'กำลังบันทึก...' : '➕ บันทึก'}
                  </button>
                </form>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                  ℹ️ สิทธิ์การใช้งานของผู้ใช้ใหม่จะถูกกำหนดเป็น <strong>Viewer (ดูได้อย่างเดียว)</strong> โดยอัตโนมัติ
                </div>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '10px' }}>
                  👥 รายชื่อผู้ใช้งานในระบบ ({profilesList.length} คน)
                </div>

                {loadingProfiles ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>กำลังโหลดข้อมูลผู้ใช้...</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '8px', overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>อีเมล (Email)</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: 600, width: '120px' }}>สิทธิ์ (Role)</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>User ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profilesList.map((prof, idx) => {
                        const isProfAdmin = (prof.role || '').toLowerCase() === 'admin'
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', fontSize: '12px', color: '#0f172a', fontWeight: 500 }}>{prof.email || '-'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: isProfAdmin ? '#fef3c7' : '#f1f5f9',
                                color: isProfAdmin ? '#92400e' : '#475569',
                                fontWeight: 600
                              }}>
                                {isProfAdmin ? '🛡️ ADMIN' : '👁️ VIEWER'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{prof.id}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
              <button onClick={() => setIsSettingsOpen(false)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔄 Modal รับคืนทรัพย์สิน */}
      {returningAsset && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setReturningAsset(null)}>
          <div className="modal-card" style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>
                🔄 รับคืนทรัพย์สินเข้าส่วนกลาง / ย้ายสังกัด
              </span>
              <button onClick={() => setReturningAsset(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={executeReturnToStock}>
              <div style={{ padding: '20px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                    {returningAsset.asset_name || 'อุปกรณ์ไอที'} ({returningAsset.asset_no || 'ไม่ระบุ Asset No'})
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontWeight: 400 }}>
                    ผู้ถือครองเดิม: <span>{getRealAssetHolder(returningAsset).realHolder}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ย้ายไปอยู่แผนก (Department) *</label>
                    <select
                      value={returnFormData.dept}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, dept: e.target.value }))}
                      style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', color: '#0f172a', fontWeight: 400 }}
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
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครองใหม่ (Owner / Holder)</label>
                    <input 
                      type="text" 
                      value={returnFormData.owner}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, owner: e.target.value }))}
                      style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#0f172a', fontWeight: 400 }}
                    />
                  </div>

                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่จัดเก็บใหม่ (Location)</label>
                    <input 
                      type="text" 
                      value={returnFormData.location}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, location: e.target.value }))}
                      style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#0f172a', fontWeight: 400 }}
                    />
                  </div>

                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>หมายเหตุการรับคืน (Remark)</label>
                    <textarea 
                      value={returnFormData.remark}
                      onChange={(e) => setReturnFormData(prev => ({ ...prev, remark: e.target.value }))}
                      rows="2"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', resize: 'vertical', color: '#0f172a', fontWeight: 400 }}
                    ></textarea>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setReturningAsset(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ยกเลิก</button>
                <button type="submit" disabled={loading} style={{ height: '36px', padding: '0 16px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{loading ? 'กำลังบันทึก...' : 'ย้าย/รับคืนอุปกรณ์'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📝 Modal Form */}
      {isFormOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{editingAsset ? '✏️ แก้ไขข้อมูลทรัพย์สิน' : '➕ เพิ่มทรัพย์สินใหม่'}</span>
              <button onClick={() => setIsFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เลขทรัพย์สิน (Asset No)</label>
                    <input type="text" name="asset_no" value={formData.asset_no} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ประเภท (Type) *</label>
                    <input type="text" name="type" value={formData.type} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} required />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ชื่ออุปกรณ์ (Asset Name) *</label>
                    <input type="text" name="asset_name" value={formData.asset_name} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} required />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ยี่ห้อ (Brand)</label>
                    <input type="text" name="brand" value={formData.brand} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>รุ่น (Model)</label>
                    <input type="text" name="model" value={formData.model} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>แผนก (Department)</label>
                    <input type="text" name="dept" value={formData.dept} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครอง / ผู้ใช้งาน</label>
                    <input type="text" name="owner" value={formData.owner} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่ตั้ง (Location)</label>
                    <input type="text" name="location" value={formData.location} onChange={handleFormChange} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontWeight: 400 }} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>หมายเหตุ (Remark)</label>
                    <textarea name="Remark" value={formData.Remark} onChange={handleFormChange} rows="2" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', resize: 'vertical', color: '#0f172a', fontWeight: 400 }}></textarea>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setIsFormOpen(false)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ยกเลิก</button>
                <button type="submit" disabled={submitting} style={{ height: '36px', padding: '0 16px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📋 Modal รายละเอียด */}
      {selectedAsset && (
        <div className="modal-overlay" onClick={() => setSelectedAsset(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>📋 รายละเอียดทรัพย์สิน</span>
              <button onClick={() => setSelectedAsset(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {Object.entries(selectedAsset).map(([key, value], idx) => (
                  <div key={idx} style={{ gridColumn: String(value).length > 30 ? 'span 2' : 'span 1' }}>
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '11px', display: 'block', marginBottom: '2px' }}>{key}</span>
                    <span style={{ color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>{value !== null && value !== '' ? String(value) : '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {userRole === 'admin' && (
                  <>
                    {getRealAssetHolder(selectedAsset).holderType === 'PERSON' && (
                      <button onClick={() => handleOpenReturnModal(selectedAsset)} style={{ height: '32px', backgroundColor: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', fontWeight: 500, fontSize: '12px', padding: '0 12px', borderRadius: '6px', cursor: 'pointer' }}>🔄 คืนเข้าส่วนกลาง</button>
                    )}
                    <button onClick={() => handleOpenEditModal(selectedAsset)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 500, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>✏️ แก้ไข</button>
                    <button onClick={() => handleDeleteAsset(selectedAsset)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 500, backgroundColor: '#fff1f2', border: 'none', color: '#e11d48', borderRadius: '6px', cursor: 'pointer' }}>🗑️ ลบ</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedAsset(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App