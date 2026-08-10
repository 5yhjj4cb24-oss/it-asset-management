import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import './App.css'

const PAGE_SIZE = 20
const DEFAULT_DOMAIN = '@gmail.com'

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

// ⏳ คำนวณอายุอุปกรณ์ ฮาร์ดแวร์
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

// 💻 ไอคอนประเภทอุปกรณ์ ฮาร์ดแวร์
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

// 🛡️ วิเคราะห์สถานะวันหมดอายุของ ซอฟต์แวร์
function getSoftwareExpireStatus(expireStr) {
  if (!expireStr) return { label: '⚪ ไม่ระบุ', color: '#64748b', bg: '#f1f5f9' }
  const str = String(expireStr).trim()
  if (str.toLowerCase().includes('lifetime')) {
    return { label: '🟢 Lifetime (ตลอดชีพ)', color: '#15803d', bg: '#dcfce7' }
  }

  const expDate = new Date(expireStr)
  if (!isNaN(expDate.getTime())) {
    const now = new Date()
    const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24))
    const formattedDate = expDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })

    if (diffDays < 0) {
      return { label: `🔴 หมดอายุ (${formattedDate})`, color: '#9f1239', bg: '#ffe4e6' }
    } else if (diffDays <= 60) {
      return { label: `🟡 ใกล้หมดอายุ (${formattedDate})`, color: '#92400e', bg: '#fef3c7' }
    } else {
      return { label: `🟢 ปกติ (${formattedDate})`, color: '#15803d', bg: '#dcfce7' }
    }
  }

  return { label: `🔵 ${expireStr}`, color: '#0369a1', bg: '#e0f2fe' }
}

const emptyHardwareForm = {
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

const emptySoftwareForm = {
  'NO': '',
  'Software name': '',
  'Version': '',
  'Installed on': '',
  'Vendor': '',
  'No. of License': 1,
  'Purchase date': '',
  'Expire Date': '',
  'Contract Number': '',
  'รหัสทะเบียน': ''
}

function App() {
  // 🔐 Auth & Permission States
  const [session, setSession] = useState(null)
  const [userRole, setUserRole] = useState('viewer')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 🔑 Forgot Password States
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  // ⚙️ Settings & User Management States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [profilesList, setProfilesList] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  // 🔀 Main System View Tab ( 'hardware' | 'software' )
  const [mainTab, setMainTab] = useState('hardware')

  // 📦 Hardware States
  const [allRawAssets, setAllRawAssets] = useState([])
  const [displayedAssets, setDisplayedAssets] = useState([])
  const [summary, setSummary] = useState([])
  const [deptList, setDeptList] = useState([])
  const [loadingHardware, setLoadingHardware] = useState(true)
  const [viewMode, setViewMode] = useState('all')
  const [personDisplayFormat, setPersonDisplayFormat] = useState('cards')
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [formData, setFormData] = useState(emptyHardwareForm)
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

  // 💻 Software States
  const [softwareList, setSoftwareList] = useState([])
  const [loadingSoftware, setLoadingSoftware] = useState(true)
  const [swSearchTerm, setSwSearchTerm] = useState('')
  const [swSelectedVendor, setSwSelectedVendor] = useState('')
  const [swSelectedInstalledOn, setSwSelectedInstalledOn] = useState('')
  const [selectedSoftware, setSelectedSoftware] = useState(null)
  const [isSoftwareFormOpen, setIsSoftwareFormOpen] = useState(false)
  const [editingSoftware, setEditingSoftware] = useState(null)
  const [softwareFormData, setSoftwareFormData] = useState(emptySoftwareForm)
  const [swSubmitting, setSwSubmitting] = useState(false)

  const [currentDateTime, setCurrentDateTime] = useState('')

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

  // 🔐 ระบบ Auth เช็ก Session & Role + ตรวจสอบลิงก์ตั้งรหัสผ่านใหม่
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUserRole(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setIsResettingPassword(true)
      if (session) fetchUserRole(session.user.id)
      else setUserRole('viewer')
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && !isResettingPassword) {
      loadHardwareData()
      loadSoftwareData()
    }
  }, [session, isResettingPassword])

  useEffect(() => {
    if (session && !isResettingPassword) {
      applyFiltersAndPagination()
    }
  }, [searchTerm, selectedDept, selectedCategory, viewMode, currentPage, allRawAssets, session, isResettingPassword])

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

  // 🔐 ฟังก์ชัน Login
  async function handleLogin(e) {
    e.preventDefault()
    setAuthLoading(true)

    let formattedEmail = loginEmail.trim()
    if (!formattedEmail.includes('@')) {
      formattedEmail = `${formattedEmail}${DEFAULT_DOMAIN}`
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password: loginPassword,
    })

    if (error) alert('เข้าสู่ระบบไม่สำเร็จ: ' + error.message)
    setAuthLoading(false)
  }

  // 🔑 ส่งอีเมลขอลิงก์รีเซ็ตรหัสผ่าน
  async function handleSendResetEmail(e) {
    e.preventDefault()
    let targetEmail = resetEmail.trim()
    if (!targetEmail) {
      alert('กรุณากรอกอีเมล หรือ Username')
      return
    }

    if (!targetEmail.includes('@')) {
      targetEmail = `${targetEmail}${DEFAULT_DOMAIN}`
    }

    setAuthLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin
      })
      if (error) throw error
      setResetSent(true)
    } catch (err) {
      console.error('Reset password error:', err)
      alert('ไม่สามารถส่งลิงก์รีเซ็ตได้: ' + err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  // 🔑 บันทิกรหัสผ่านใหม่
  async function handleUpdateNewPassword(e) {
    e.preventDefault()
    if (newPassword !== confirmNewPassword) {
      alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }

    if (newPassword.length < 6) {
      alert('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร')
      return
    }

    setAuthLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      alert('ตั้งค่ารหัสผ่านใหม่เรียบร้อยแล้ว!')
      setIsResettingPassword(false)
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err) {
      console.error('Update password error:', err)
      alert('เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่: ' + err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // ⚙️ โหลดรายชื่อผู้ใช้งานทั้งหมด
  async function loadProfilesList() {
    setLoadingProfiles(true)
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('email', { ascending: true })
      if (error) throw error
      setProfilesList(data || [])
    } catch (err) {
      console.error('Fetch profiles error:', err)
    } finally {
      setLoadingProfiles(false)
    }
  }

  // ➕ เพิ่ม User ใหม่ สิทธิ์ Viewer
  async function handleAddViewerUser(e) {
    e.preventDefault()
    let formattedUserEmail = newUserEmail.trim()
    if (!formattedUserEmail || !newUserPassword.trim()) {
      alert('กรุณากรอกอีเมล/Username และรหัสผ่านให้ครบถ้วน')
      return
    }

    if (!formattedUserEmail.includes('@')) {
      formattedUserEmail = `${formattedUserEmail}${DEFAULT_DOMAIN}`
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
        email: formattedUserEmail,
        password: newUserPassword.trim(),
      })

      if (error) throw error

      alert(`เพิ่มผู้ใช้งาน "${formattedUserEmail}" สิทธิ์ Viewer เรียบร้อยแล้ว!`)
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

  // 📦 โหลดข้อมูล Hardware
  async function loadHardwareData() {
    setLoadingHardware(true)
    try {
      const { data: summaryData } = await supabase.from('view_asset_summary_by_type').select('*')
      setSummary(summaryData || [])

      const { data: assetData, error } = await supabase.from('assets_v2').select('*')
      if (error) {
        console.error('Fetch error:', error)
      } else if (assetData) {
        setAllRawAssets(assetData)
        const uniqueDepts = [...new Set(assetData.map(d => d.dept).filter(Boolean))].sort()
        setDeptList(uniqueDepts)
      }
    } catch (err) {
      console.error('Error loading hardware data:', err)
    } finally {
      setLoadingHardware(false)
    }
  }

  // 💻 โหลดข้อมูล Software
  async function loadSoftwareData() {
    setLoadingSoftware(true)
    try {
      const { data, error } = await supabase.from('software_assets').select('*')
      if (error) {
        console.error('Fetch software error:', error)
      } else if (data) {
        const validSoftware = data.filter(item => {
          const name = item['Software name'] || item.software_name || item.name
          return name && String(name).trim() !== '' && String(name) !== 'Software name'
        })
        setSoftwareList(validSoftware)
      }
    } catch (err) {
      console.error('Error loading software data:', err)
    } finally {
      setLoadingSoftware(false)
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

  // 💻 ตัวกรอง Software
  function getFilteredSoftwareList() {
    let result = [...softwareList]

    if (swSelectedVendor) {
      result = result.filter(item => (item['Vendor'] || item.vendor || '') === swSelectedVendor)
    }

    if (swSelectedInstalledOn) {
      result = result.filter(item => (item['Installed on'] || item.installed_on || '') === swSelectedInstalledOn)
    }

    if (swSearchTerm.trim() !== '') {
      const term = swSearchTerm.toLowerCase().trim()
      result = result.filter(item => {
        return JSON.stringify(item).toLowerCase().includes(term)
      })
    }

    return result
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
      setLoadingHardware(true)
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
      loadHardwareData()
    } catch (err) {
      console.error('Return error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setLoadingHardware(false)
    }
  }

  function handleOpenAddModal() {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์เพิ่มทรัพย์สิน (Admin Only)')
      return
    }
    setEditingAsset(null)
    setFormData(emptyHardwareForm)
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
      loadHardwareData()
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
      setLoadingHardware(true)
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
      loadHardwareData()
    } catch (err) {
      console.error('Delete error:', err)
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message)
    } finally {
      setLoadingHardware(false)
    }
  }

  // 💻 ซอฟต์แวร์ Modal CRUD Handlers
  function handleOpenAddSoftwareModal() {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์เพิ่มซอฟต์แวร์ (Admin Only)')
      return
    }
    setEditingSoftware(null)
    setSoftwareFormData(emptySoftwareForm)
    setIsSoftwareFormOpen(true)
  }

  function handleOpenEditSoftwareModal(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์แก้ไขซอฟต์แวร์ (Admin Only)')
      return
    }
    setEditingSoftware(item)
    setSoftwareFormData({
      'NO': item['NO'] || item.NO || item.asset_no || '',
      'Software name': item['Software name'] || item.software_name || item.name || '',
      'Version': item['Version'] || item.version || '',
      'Installed on': item['Installed on'] || item.installed_on || '',
      'Vendor': item['Vendor'] || item.vendor || '',
      'No. of License': item['No. of License'] || item.no_of_license || 1,
      'Purchase date': item['Purchase date'] || item.purchase_date || '',
      'Expire Date': item['Expire Date'] || item.expire_date || '',
      'Contract Number': item['Contract Number'] || item.contract_number || '',
      'รหัสทะเบียน': item['รหัสทะเบียน'] || item.registration_code || ''
    })
    setIsSoftwareFormOpen(true)
  }

  async function handleSoftwareFormSubmit(e) {
    e.preventDefault()
    if (!softwareFormData['Software name'].trim()) {
      alert('กรุณากรอกชื่อซอฟต์แวร์')
      return
    }

    setSwSubmitting(true)
    try {
      if (editingSoftware) {
        let query = supabase.from('software_assets').update(softwareFormData)
        if (editingSoftware.id) {
          query = query.eq('id', editingSoftware.id)
        } else {
          query = query.eq('Software name', editingSoftware['Software name'])
        }
        const { error } = await query
        if (error) throw error
        alert('แก้ไขข้อมูลซอฟต์แวร์สำเร็จ!')
      } else {
        const { error } = await supabase.from('software_assets').insert([softwareFormData])
        if (error) throw error
        alert('เพิ่มข้อมูลซอฟต์แวร์สำเร็จ!')
      }

      setIsSoftwareFormOpen(false)
      setSelectedSoftware(null)
      loadSoftwareData()
    } catch (err) {
      console.error('Software Submit error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSwSubmitting(false)
    }
  }

  async function handleDeleteSoftware(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์ลบซอฟต์แวร์ (Admin Only)')
      return
    }
    const swName = item['Software name'] || item.software_name || 'รายการนี้'
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบซอฟต์แวร์ "${swName}" ออกจากระบบ?`)) return

    try {
      setLoadingSoftware(true)
      let query = supabase.from('software_assets').delete()
      if (item.id) {
        query = query.eq('id', item.id)
      } else {
        query = query.eq('Software name', item['Software name'])
      }
      const { error } = await query
      if (error) throw error

      alert('ลบข้อมูลซอฟต์แวร์เรียบร้อยแล้ว')
      setSelectedSoftware(null)
      loadSoftwareData()
    } catch (err) {
      console.error('Delete software error:', err)
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message)
    } finally {
      setLoadingSoftware(false)
    }
  }

  function exportHardwareToCSV() {
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
    link.setAttribute('download', `Hardware_Assets_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function exportSoftwareToCSV() {
    if (!softwareList || softwareList.length === 0) {
      alert('ไม่มีข้อมูลซอฟต์แวร์สำหรับ Export')
      return
    }

    const headers = ['NO', 'Software Name', 'Version', 'Installed On', 'Vendor', 'No. of License', 'Purchase Date', 'Expire Date', 'Contract Number', 'รหัสทะเบียน']
    const csvRows = [headers.join(',')]

    softwareList.forEach(item => {
      const row = [
        `"${item['NO'] || item.asset_no || ''}"`,
        `"${(item['Software name'] || item.software_name || '').replace(/"/g, '""')}"`,
        `"${item['Version'] || item.version || ''}"`,
        `"${item['Installed on'] || item.installed_on || ''}"`,
        `"${item['Vendor'] || item.vendor || ''}"`,
        `"${item['No. of License'] || item.no_of_license || 1}"`,
        `"${item['Purchase date'] || item.purchase_date || ''}"`,
        `"${item['Expire Date'] || item.expire_date || ''}"`,
        `"${item['Contract Number'] || item.contract_number || ''}"`,
        `"${item['รหัสทะเบียน'] || item.registration_code || ''}"`
      ]
      csvRows.push(row.join(','))
    })

    const csvContent = '\uFEFF' + csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `Software_Licenses_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 🔑 หน้าจอตั้งรหัสผ่านใหม่
  if (isResettingPassword) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', fontFamily: 'Sarabun, Inter, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#ffffff', padding: '36px 32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '6px', fontWeight: 600, padding: '4px 8px', fontSize: '12px', display: 'inline-block', marginBottom: '10px' }}>
              🔑 Reset Password
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0f172a', margin: 0 }}>กำหนดรหัสผ่านใหม่</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>ระบุรหัสผ่านใหม่ที่คุณต้องการใช้งาน</p>
          </div>

          <form onSubmit={handleUpdateNewPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>รหัสผ่านใหม่ ( New Password )</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="อย่างน้อย 6 ตัวอักษร" 
                required 
                style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>ยืนยันรหัสผ่านใหม่ ( Confirm Password )</label>
              <input 
                type="password" 
                value={confirmNewPassword} 
                onChange={e => setConfirmNewPassword(e.target.value)} 
                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" 
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
                marginTop: '8px'
              }}
            >
              {authLoading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 🔑 หน้าจอ Login / ลืมรหัสผ่าน
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Sarabun, Inter, sans-serif', backgroundColor: '#ffffff' }}>
        
        {/* ฝั่งซ้าย Enterprise Banner (30%) */}
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
              ศูนย์กลางควบคุม ตรวจสอบ และติดตามสถานะฮาร์ดแวร์และลิขสิทธิ์ซอฟต์แวร์ทุกประเภท
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255, 255, 255, 0.75)', padding: '10px 12px', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>📦</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Hardware & Software Inventory</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>จัดการฮาร์ดแวร์และซอฟต์แวร์ในระบบเดียว</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255, 255, 255, 0.75)', padding: '10px 12px', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>🔑</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Role-Based Access</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>แยกสิทธิ์ Admin และ Viewer</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', borderTop: '1px solid #cbd5e1', paddingTop: '14px' }}>
            © {new Date().getFullYear()} IT Asset Management System.
          </div>
        </div>

        {/* ฝั่งขวา Login Form (70%) */}
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
            
            {isForgotPassword ? (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '6px', fontWeight: 600, padding: '3px 8px', fontSize: '12px', display: 'inline-block', marginBottom: '10px' }}>
                    Password Recovery
                  </div>
                  <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0f172a', margin: 0 }}>ลืมรหัสผ่าน?</h2>
                  <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>กรอก Username หรืออีเมลเพื่อรับลิงก์รีเซ็ต</p>
                </div>

                {resetSent ? (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ color: '#166534', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>✉️ ส่งอีเมลเรียบร้อยแล้ว!</div>
                    <p style={{ color: '#15803d', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                      ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลผู้ใช้เรียบร้อยแล้ว
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendResetEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>Username หรือ อีเมล</label>
                      <input 
                        type="text" 
                        value={resetEmail} 
                        onChange={e => setResetEmail(e.target.value)} 
                        placeholder="admin หรือ name@company.com" 
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
                        marginTop: '4px'
                      }}
                    >
                      {authLoading ? 'กำลังส่งอีเมล...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                    </button>
                  </form>
                )}

                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsForgotPassword(false)
                      setResetSent(false)
                    }} 
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    ◀ กลับไปหน้าเข้าสู่ระบบ
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ backgroundColor: '#f1f5f9', color: '#0f172a', borderRadius: '6px', fontWeight: 500, padding: '3px 8px', fontSize: '12px', display: 'inline-block', marginBottom: '10px' }}>
                    IT Portal
                  </div>
                  <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0f172a', margin: 0 }}>เข้าสู่ระบบบริหารทรัพย์สิน</h2>
                  <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>ระบุ Username หรืออีเมลเพื่อเข้าใช้งานระบบ</p>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>Username หรือ อีเมล (Email)</label>
                    <input 
                      type="text" 
                      value={loginEmail} 
                      onChange={e => setLoginEmail(e.target.value)} 
                      placeholder="admin หรือ name@company.com" 
                      required 
                      style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a' }}>รหัสผ่าน (Password)</label>
                      <button 
                        type="button" 
                        onClick={() => {
                          setResetEmail(loginEmail)
                          setIsForgotPassword(true)
                        }} 
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                      >
                        ลืมรหัสผ่าน?
                      </button>
                    </div>
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
                      marginTop: '8px'
                    }}
                  >
                    {authLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                  </button>
                </form>
              </div>
            )}

          </div>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE) || 1
  const groupedPersons = getGroupedPersonAssets()
  const filteredSoftware = getFilteredSoftwareList()

  // คำนวณสรุปสถิติ Software
  const totalSoftwareLicenseCount = softwareList.reduce((sum, item) => sum + (Number(item['No. of License'] || item.no_of_license) || 0), 0)
  const lifetimeSoftwareCount = softwareList.filter(item => String(item['Expire Date'] || item.expire_date || '').toLowerCase().includes('lifetime')).length
  const vendorsList = [...new Set(softwareList.map(item => item['Vendor'] || item.vendor).filter(Boolean))].sort()
  const installedOnList = [...new Set(softwareList.map(item => item['Installed on'] || item.installed_on).filter(Boolean))].sort()

  // ----------------------------------------------------
  // 🖥️ หน้าจอหลักเมื่อเข้าสู่ระบบเรียบร้อยแล้ว
  // ----------------------------------------------------
  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'Sarabun, Inter, sans-serif', color: '#0f172a' }}>
      
      {/* Top Navbar */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '6px', fontWeight: 600, padding: '4px 8px', fontSize: '13px' }}>IT</div>
            <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '16px', letterSpacing: '-0.2px' }}>IT Asset Management</span>
          </div>

          {/* 🔀 Main Navigation Switcher */}
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px', marginLeft: '12px' }}>
            <button
              onClick={() => setMainTab('hardware')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: mainTab === 'hardware' ? 600 : 500,
                backgroundColor: mainTab === 'hardware' ? '#ffffff' : 'transparent',
                color: mainTab === 'hardware' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: mainTab === 'hardware' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📦 ทรัพย์สินฮาร์ดแวร์
            </button>
            <button
              onClick={() => setMainTab('software')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: mainTab === 'software' ? 600 : 500,
                backgroundColor: mainTab === 'software' ? '#ffffff' : 'transparent',
                color: mainTab === 'software' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: mainTab === 'software' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              💻 ลิขสิทธิ์ซอฟต์แวร์ ({softwareList.length})
            </button>
          </div>
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
                  fontWeight: 500
                }}
              >
                ⚙️ ตั้งค่า
              </button>
            )}

            <button 
              onClick={handleLogout}
              style={{ backgroundColor: '#f8fafc', color: '#0f172a', border: 'none', height: '32px', padding: '0 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
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
          <h1 style={{ color: '#0f172a', fontWeight: 600, fontSize: '20px', margin: 0 }}>
            {mainTab === 'hardware' ? 'IT Hardware Overview' : 'Software License Management'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', fontWeight: 400, margin: '2px 0 0' }}>
            {mainTab === 'hardware' 
              ? 'ระบบบริหารจัดการ ตรวจสอบ และจำแนกผู้ถือครองทรัพย์สินฮาร์ดแวร์ไอที' 
              : 'ศูนย์ควบคุมและติดตามสถานะลิขสิทธิ์ซอฟต์แวร์ สัญญา และวันหมดอายุ'}
          </p>
        </div>

        {/* ---------------------------------------------------- */}
        {/* 📦 VIEW 1: HARDWARE ASSETS MANAGEMENT */}
        {/* ---------------------------------------------------- */}
        {mainTab === 'hardware' && (
          <div>
            {/* Top Executive KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>รวมทรัพย์สินฮาร์ดแวร์</span>
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
                  <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>หมวดหมู่อุปกรณ์</span>
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

            {/* Hardware Main Panel */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              
              {/* Tabs */}
              <div style={{ padding: '12px 16px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px', backgroundColor: '#f8fafc' }}>
                <button 
                  onClick={() => { setViewMode('all'); setCurrentPage(1); }}
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
                    fontSize: '13px'
                  }}
                >
                  📦 ทั้งหมด ({allRawAssets.length.toLocaleString()})
                </button>

                <button 
                  onClick={() => { setViewMode('person'); setCurrentPage(1); }}
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
                    fontSize: '13px'
                  }}
                >
                  👤 รายบุคคลถือครอง
                </button>

                <button 
                  onClick={() => { setViewMode('dept'); setCurrentPage(1); }}
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
                    fontSize: '13px'
                  }}
                >
                  🏢 รายแผนก / ส่วนกลางถือครอง
                </button>
              </div>

              {/* Controls Bar */}
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '15px' }}>
                    {viewMode === 'all' && 'รายการทรัพย์สินฮาร์ดแวร์ทั้งหมด'}
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
                          color: personDisplayFormat === 'cards' ? '#0f172a' : '#64748b'
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
                          color: personDisplayFormat === 'table' ? '#0f172a' : '#64748b'
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
                        cursor: 'pointer'
                      }}
                    >
                      ➕ เพิ่มทรัพย์สิน
                    </button>
                  )}

                  <button 
                    onClick={exportHardwareToCSV} 
                    style={{ 
                      backgroundColor: '#f8fafc', 
                      color: '#0f172a', 
                      border: '1px solid #e2e8f0', 
                      fontWeight: 500, 
                      borderRadius: '6px', 
                      height: '36px',
                      padding: '0 16px', 
                      fontSize: '13px',
                      cursor: 'pointer'
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
                      backgroundColor: '#f8fafc',
                      color: '#0f172a',
                      fontWeight: 500
                    }}
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
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
                      backgroundColor: '#f8fafc', 
                      color: '#0f172a', 
                      fontWeight: 500
                    }}
                    value={selectedDept}
                    onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
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
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    style={{ 
                      height: '36px',
                      width: '220px',
                      border: '1px solid #e2e8f0', 
                      borderRadius: '6px', 
                      padding: '0 12px', 
                      fontSize: '13px',
                      color: '#0f172a',
                      backgroundColor: '#f8fafc',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Hardware List Display */}
              {viewMode === 'person' && personDisplayFormat === 'cards' ? (
                <div style={{ padding: '16px' }}>
                  {loadingHardware ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>กำลังดึงข้อมูล...</div>
                  ) : groupedPersons.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>ไม่พบรายชื่อพนักงานตามตัวกรอง</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {groupedPersons.map((person, pIdx) => (
                        <div key={pIdx} style={{ border: '1px solid #e2e8f0', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
                          <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: person.isResigned ? '#dc2626' : '#0f172a', fontWeight: 600, fontSize: '14px' }}>{person.name}</div>
                              <div style={{ color: '#64748b', fontSize: '11px' }}>แผนก: {person.dept}</div>
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
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{ageInfo.label}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {userRole === 'admin' && (
                                    <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                      <button onClick={() => handleOpenReturnModal(asset)} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}>🔄 คืน</button>
                                      <button onClick={() => handleOpenEditModal(asset)} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }}>✏️</button>
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
                /* Hardware Table */
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  {loadingHardware ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>กำลังดึงข้อมูล...</div>
                  ) : displayedAssets.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>ไม่พบข้อมูลตามคำค้นหา/ตัวกรอง</div>
                  ) : (
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px', tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '14px 16px', textAlign: 'left', width: '150px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ASSET NO</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ชื่ออุปกรณ์</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', width: '220px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ผู้ถือครอง</th>
                          <th style={{ padding: '14px 16px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ลักษณะถือครอง</th>
                          <th style={{ padding: '14px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ประเภท</th>
                          <th style={{ padding: '14px 16px', textAlign: 'center', width: '90px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>แผนก</th>
                          <th style={{ padding: '14px 16px', textAlign: 'center', width: '170px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedAssets.map((item, index) => {
                          const { realHolder, holderType, isResigned } = getRealAssetHolder(item)

                          return (
                            <tr key={index} onClick={() => setSelectedAsset(item)} style={{ backgroundColor: isResigned ? '#fff1f2' : 'transparent', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '13px', color: '#0f172a', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                                  {item.asset_no || '-'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 500, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.asset_name || '-'}
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ color: isResigned ? '#e11d48' : '#0f172a', fontWeight: 500, fontSize: '13px' }}>{realHolder}</span>
                                  {isResigned && <span style={{ backgroundColor: '#ffe4e6', color: '#9f1239', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>ลาออก</span>}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {holderType === 'PERSON' ? (
                                  <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 600, fontSize: '11px', padding: '4px 10px', borderRadius: '20px' }}>👤 บุคคล</span>
                                ) : (
                                  <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 500, fontSize: '11px', padding: '4px 10px', borderRadius: '20px' }}>🏢 ส่วนกลาง</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '12px', color: '#334155' }}>{item.type || '-'}</td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '12px', color: '#334155' }}>{item.dept || '-'}</td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                {userRole === 'admin' ? (
                                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                    {holderType === 'PERSON' ? (
                                      <button onClick={() => handleOpenReturnModal(item)} title="รับคืนเข้าส่วนกลาง" style={{ backgroundColor: '#f1f5f9', color: '#0f172a', border: 'none', fontWeight: 600, fontSize: '11px', padding: '0 10px', height: '30px', borderRadius: '6px', cursor: 'pointer' }}>🔄 คืน</button>
                                    ) : (
                                      <div style={{ width: '52px', height: '30px' }} />
                                    )}
                                    <button onClick={() => handleOpenEditModal(item)} title="แก้ไข" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>✏️</button>
                                    <button onClick={() => handleDeleteAsset(item)} title="ลบ" style={{ backgroundColor: '#fff1f2', border: 'none', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#e11d48' }}>🗑️</button>
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

              {/* Hardware Pagination */}
              {(viewMode !== 'person' || personDisplayFormat === 'table') && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                    หน้า {currentPage} จาก {totalPages} (รวม {totalFilteredCount.toLocaleString()} รายการ)
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button disabled={currentPage === 1 || loadingHardware} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} style={{ height: '32px', padding: '0 14px', borderRadius: '6px', border: 'none', backgroundColor: currentPage === 1 ? '#f1f5f9' : '#f8fafc', color: currentPage === 1 ? '#cbd5e1' : '#0f172a', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 500 }}>◀ ก่อนหน้า</button>
                    <button disabled={currentPage >= totalPages || loadingHardware} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} style={{ height: '32px', padding: '0 14px', borderRadius: '6px', border: 'none', backgroundColor: currentPage >= totalPages ? '#f1f5f9' : '#f8fafc', color: currentPage >= totalPages ? '#cbd5e1' : '#0f172a', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 500 }}>ถัดไป ▶</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* 💻 VIEW 2: SOFTWARE LICENSES MANAGEMENT */}
        {/* ---------------------------------------------------- */}
        {mainTab === 'software' && (
          <div>
            {/* Top Software KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>จำพวกซอฟต์แวร์ในระบบ</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '24px' }}>{softwareList.length}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>💻</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>จำนวน License รวมทั้งหมด</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '24px' }}>{totalSoftwareLicenseCount.toLocaleString()}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>สิทธิ์ (Licenses)</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>🔑</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>ลิขสิทธิ์ประเภท Lifetime</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#166534', fontWeight: 600, fontSize: '24px' }}>{lifetimeSoftwareCount}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>♾️</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', display: 'block' }}>Subscription / รายปี</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0284c7', fontWeight: 600, fontSize: '24px' }}>{softwareList.length - lifetimeSoftwareCount}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>📅</div>
              </div>
            </div>

            {/* Software Main Panel */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              
              {/* Controls Bar */}
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '15px' }}>
                  รายการลิขสิทธิ์ซอฟต์แวร์ทั้งหมด ({filteredSoftware.length} รายการ)
                </span>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {userRole === 'admin' && (
                    <button 
                      onClick={handleOpenAddSoftwareModal}
                      style={{
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        height: '36px',
                        padding: '0 16px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      ➕ เพิ่มซอฟต์แวร์
                    </button>
                  )}

                  <button 
                    onClick={exportSoftwareToCSV} 
                    style={{ 
                      backgroundColor: '#f8fafc', 
                      color: '#0f172a', 
                      border: '1px solid #e2e8f0', 
                      fontWeight: 500, 
                      borderRadius: '6px', 
                      height: '36px',
                      padding: '0 16px', 
                      fontSize: '13px',
                      cursor: 'pointer'
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
                      backgroundColor: '#f8fafc',
                      color: '#0f172a',
                      fontWeight: 500
                    }}
                    value={swSelectedVendor}
                    onChange={(e) => setSwSelectedVendor(e.target.value)}
                  >
                    <option value="">🏢 ทุก Vendor ({vendorsList.length})</option>
                    {vendorsList.map((vendor, idx) => (
                      <option key={idx} value={vendor}>{vendor}</option>
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
                      backgroundColor: '#f8fafc', 
                      color: '#0f172a', 
                      fontWeight: 500
                    }}
                    value={swSelectedInstalledOn}
                    onChange={(e) => setSwSelectedInstalledOn(e.target.value)}
                  >
                    <option value="">🖥️ ทุกตำแหน่งติดตั้ง ({installedOnList.length})</option>
                    {installedOnList.map((loc, idx) => (
                      <option key={idx} value={loc}>{loc}</option>
                    ))}
                  </select>

                  <input 
                    type="text" 
                    placeholder="ค้นหาชื่อซอฟต์แวร์, สัญญา..." 
                    value={swSearchTerm}
                    onChange={(e) => setSwSearchTerm(e.target.value)}
                    style={{ 
                      height: '36px',
                      width: '220px',
                      border: '1px solid #e2e8f0', 
                      borderRadius: '6px', 
                      padding: '0 12px', 
                      fontSize: '13px',
                      color: '#0f172a',
                      backgroundColor: '#f8fafc',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Software Table */}
              <div style={{ overflowX: 'auto', width: '100%' }}>
                {loadingSoftware ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>กำลังดึงข้อมูลซอฟต์แวร์...</div>
                ) : filteredSoftware.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>ไม่พบข้อมูลซอฟต์แวร์ตามคำค้นหา/ตัวกรอง</div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left', width: '150px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>รหัส / ASSET NO</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ชื่อซอฟต์แวร์ (SOFTWARE NAME)</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>VERSION</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ติดตั้งบน</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>VENDOR</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', width: '90px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>LICENSE</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', width: '180px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>วันหมดอายุ / สถานะ</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', width: '100px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSoftware.map((item, index) => {
                        const swName = item['Software name'] || item.software_name || item.name || '-'
                        const assetNo = item['NO'] || item['รหัสทะเบียน'] || item.asset_no || '-'
                        const version = item['Version'] || item.version || '-'
                        const installedOn = item['Installed on'] || item.installed_on || '-'
                        const vendor = item['Vendor'] || item.vendor || '-'
                        const licenseCount = item['No. of License'] || item.no_of_license || 1
                        const expireVal = item['Expire Date'] || item.expire_date || '-'
                        const statusInfo = getSoftwareExpireStatus(expireVal)

                        return (
                          <tr key={index} onClick={() => setSelectedSoftware(item)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: '#0f172a', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                                {assetNo}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 600, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {swName}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '12px', color: '#334155' }}>
                              {version}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 500, fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                                {installedOn}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '12px', color: '#334155', whiteSpace: 'nowrap' }}>
                              {vendor}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>{licenseCount}</span> <span style={{ fontSize: '11px', color: '#64748b' }}>สิทธิ์</span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ backgroundColor: statusInfo.bg, color: statusInfo.color, fontWeight: 600, fontSize: '11px', padding: '4px 10px', borderRadius: '20px' }}>
                                {statusInfo.label}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              {userRole === 'admin' ? (
                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                  <button onClick={() => handleOpenEditSoftwareModal(item)} title="แก้ไข" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>✏️</button>
                                  <button onClick={() => handleDeleteSoftware(item)} title="ลบ" style={{ backgroundColor: '#fff1f2', border: 'none', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#e11d48' }}>🗑️</button>
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

            </div>
          </div>
        )}

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
                    <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Username หรือ อีเมล *</label>
                    <input type="text" placeholder="user หรือ user@company.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>รหัสผ่าน (อย่างน้อย 6 ตัว) *</label>
                    <input type="password" placeholder="••••••••" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                  </div>
                  <button type="submit" disabled={addingUser} style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '0 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, height: '36px' }}>{addingUser ? 'กำลังบันทึก...' : '➕ บันทึก'}</button>
                </form>
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
                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: isProfAdmin ? '#fef3c7' : '#f1f5f9', color: isProfAdmin ? '#92400e' : '#475569', fontWeight: 600 }}>
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

      {/* 🔄 Modal รับคืน Hardware */}
      {returningAsset && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setReturningAsset(null)}>
          <div className="modal-card" style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>🔄 รับคืนทรัพย์สินเข้าส่วนกลาง</span>
              <button onClick={() => setReturningAsset(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={executeReturnToStock}>
              <div style={{ padding: '20px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{returningAsset.asset_name || 'อุปกรณ์ไอที'} ({returningAsset.asset_no || 'ไม่ระบุ Asset No'})</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>ผู้ถือครองเดิม: <span>{getRealAssetHolder(returningAsset).realHolder}</span></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ย้ายไปอยู่แผนก *</label>
                    <select value={returnFormData.dept} onChange={(e) => setReturnFormData(prev => ({ ...prev, dept: e.target.value }))} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} required>
                      <option value="แผนกสารสนเทศ">แผนกสารสนเทศ (IT)</option>
                      <option value="ส่วนกลาง">ส่วนกลางบริษัท</option>
                      {deptList.map((d, i) => <option key={i} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครองใหม่</label>
                    <input type="text" value={returnFormData.owner} onChange={(e) => setReturnFormData(prev => ({ ...prev, owner: e.target.value }))} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่จัดเก็บใหม่</label>
                    <input type="text" value={returnFormData.location} onChange={(e) => setReturnFormData(prev => ({ ...prev, location: e.target.value }))} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>หมายเหตุ</label>
                    <textarea value={returnFormData.remark} onChange={(e) => setReturnFormData(prev => ({ ...prev, remark: e.target.value }))} rows="2" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}></textarea>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setReturningAsset(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ยกเลิก</button>
                <button type="submit" disabled={loadingHardware} style={{ height: '36px', padding: '0 16px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{loadingHardware ? 'กำลังบันทึก...' : 'ย้าย/รับคืนอุปกรณ์'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📝 Modal Form Hardware */}
      {isFormOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{editingAsset ? '✏️ แก้ไขข้อมูลฮาร์ดแวร์' : '➕ เพิ่มฮาร์ดแวร์ใหม่'}</span>
              <button onClick={() => setIsFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เลขทรัพย์สิน (Asset No)</label>
                    <input type="text" value={formData.asset_no} onChange={e => setFormData({ ...formData, asset_no: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ประเภท (Type) *</label>
                    <input type="text" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} required />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ชื่ออุปกรณ์ (Asset Name) *</label>
                    <input type="text" value={formData.asset_name} onChange={e => setFormData({ ...formData, asset_name: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} required />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ยี่ห้อ (Brand)</label>
                    <input type="text" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>แผนก (Department)</label>
                    <input type="text" value={formData.dept} onChange={e => setFormData({ ...formData, dept: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครอง</label>
                    <input type="text" value={formData.owner} onChange={e => setFormData({ ...formData, owner: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่ตั้ง</label>
                    <input type="text" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
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

      {/* 💻 Modal Form Software */}
      {isSoftwareFormOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsSoftwareFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{editingSoftware ? '✏️ แก้ไขข้อมูลซอฟต์แวร์' : '➕ เพิ่มซอฟต์แวร์ใหม่'}</span>
              <button onClick={() => setIsSoftwareFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleSoftwareFormSubmit}>
              <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ชื่อซอฟต์แวร์ (Software Name) *</label>
                    <input type="text" value={softwareFormData['Software name']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Software name': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} required />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เวอร์ชัน (Version)</label>
                    <input type="text" value={softwareFormData['Version']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Version': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ติดตั้งบน (Installed On)</label>
                    <input type="text" value={softwareFormData['Installed on']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Installed on': e.target.value })} placeholder="Server, Cloud, PC" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้จัดจำหน่าย (Vendor)</label>
                    <input type="text" value={softwareFormData['Vendor']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Vendor': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>จำนวน License</label>
                    <input type="number" value={softwareFormData['No. of License']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'No. of License': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>วันที่สั่งซื้อ (Purchase Date)</label>
                    <input type="date" value={softwareFormData['Purchase date']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Purchase date': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>วันหมดอายุ / Lifetime</label>
                    <input type="text" value={softwareFormData['Expire Date']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Expire Date': e.target.value })} placeholder="2026-12-31 หรือ Lifetime" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>รหัสทะเบียน / Asset NO</label>
                    <input type="text" value={softwareFormData['NO']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'NO': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เลขที่สัญญา (Contract No)</label>
                    <input type="text" value={softwareFormData['Contract Number']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Contract Number': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setIsSoftwareFormOpen(false)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ยกเลิก</button>
                <button type="submit" disabled={swSubmitting} style={{ height: '36px', padding: '0 16px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{swSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📋 Modal รายละเอียด Hardware */}
      {selectedAsset && (
        <div className="modal-overlay" onClick={() => setSelectedAsset(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>📋 รายละเอียดฮาร์ดแวร์</span>
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

      {/* 📋 Modal รายละเอียด Software */}
      {selectedSoftware && (
        <div className="modal-overlay" onClick={() => setSelectedSoftware(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>📋 รายละเอียดลิขสิทธิ์ซอฟต์แวร์</span>
              <button onClick={() => setSelectedSoftware(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {Object.entries(selectedSoftware).map(([key, value], idx) => (
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
                    <button onClick={() => handleOpenEditSoftwareModal(selectedSoftware)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 500, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>✏️ แก้ไข</button>
                    <button onClick={() => handleDeleteSoftware(selectedSoftware)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 500, backgroundColor: '#fff1f2', border: 'none', color: '#e11d48', borderRadius: '6px', cursor: 'pointer' }}>🗑️ ลบ</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedSoftware(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App