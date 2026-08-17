import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage, // เปลี่ยนมาใช้ sessionStorage เพื่อให้ปิดเบราว์เซอร์แล้วหลุดล็อกอินทันที
    autoRefreshToken: true,
    persistSession: true
  }
})
import { supabase } from './supabaseClient'
import './App.css'

const PAGE_SIZE = 20
const DEFAULT_DOMAIN = '@gmail.com'

function DragonflyLogo({ size = 32, color = '#6b21a8' }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <g stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="50" cy="23" rx="4.5" ry="6" />
        <path d="M 50 29 C 43 35, 43 45, 50 51 C 57 45, 57 35, 50 29 Z" />
        <path d="M 50 35 C 30 16, 6 22, 10 33 C 14 43, 38 41, 50 39" />
        <path d="M 50 35 C 70 16, 94 22, 90 33 C 86 43, 62 41, 50 39" />
        <path d="M 50 39 C 28 34, 12 42, 16 51 C 20 59, 40 48, 50 46" />
        <path d="M 50 39 C 72 34, 88 42, 84 51 C 80 59, 60 48, 50 46" />
        <path d="M 50 51 C 42 65, 44 80, 50 93 C 56 80, 58 65, 50 51 Z" />
      </g>
    </svg>
  )
}

function getUserInitials(email) {
  if (!email) return 'IT'
  const namePart = email.split('@')[0]
  const cleanName = namePart.replace(/[^a-zA-Z0-9]/g, '')
  if (cleanName.length >= 2) return cleanName.substring(0, 2).toUpperCase()
  return cleanName.toUpperCase() || 'IT'
}

function isPersonName(text) {
  if (!text || typeof text !== 'string') return false
  const str = text.trim()
  const hasPrefix = /^(น\.ส\.|นาย|นาง|คุณ|mr\.|mrs\.|ms\.)/i.test(str)
  const hasNickname = /\([\u0E00-\u0E7Fa-zA-Z0-9_]+\)/.test(str)
  const isRoomOrDept = /^(ห้อง|ชั้น|แผนก|อยู่ที่|คลัง|counter|โต๊ะ|หลังโต๊ะ)/i.test(str)
  return (hasPrefix || hasNickname) && !isRoomOrDept
}

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
      isResigned: isResigned
    }
  }

  if (isPersonName(locationCol)) {
    return {
      realHolder: locationCol,
      holderType: 'PERSON',
      realLocation: holderCol ? `อยู่ที่ ${holderCol}` : '-',
      isResigned: isResigned
    }
  }

  return {
    realHolder: holderCol || item.dept || 'ส่วนกลาง',
    holderType: 'DEPT',
    realLocation: locationCol || '-',
    isResigned: isResigned
  }
}

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
    return { ageText: 'ไม่ระบุปี', ageNum: -1, badgeClass: 'age-unknown', label: 'ไม่ระบุข้อมูลปีจัดซื้อ' }
  }

  const currentYear = new Date().getFullYear()
  const age = currentYear - yearAD

  if (age >= 4) {
    return { ageText: `${age} ปี`, ageNum: age, badgeClass: 'age-old', label: `${age} ปี (ครบรอบเปลี่ยนทดแทน)` }
  } else if (age >= 2) {
    return { ageText: `${age} ปี`, ageNum: age, badgeClass: 'age-mid', label: `${age} ปี (ระยะปานกลาง)` }
  } else {
    return { ageText: `${age <= 0 ? 'ใหม่' : age + ' ปี'}`, ageNum: age, badgeClass: 'age-new', label: `${age <= 0 ? 'ใหม่ปีนี้' : age + ' ปี (ระยะเริ่มต้น)'}` }
  }
}

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

function getSoftwareExpireStatus(expireStr) {
  if (!expireStr) return { statusKey: 'unknown', label: 'ไม่ระบุข้อมูล', color: '#64748b', bg: '#f1f5f9' }
  const str = String(expireStr).trim()
  if (str.toLowerCase().includes('lifetime')) {
    return { statusKey: 'lifetime', label: 'ตลอดชีพ (Lifetime)', color: '#15803d', bg: '#dcfce7' }
  }

  const expDate = new Date(expireStr)
  if (!isNaN(expDate.getTime())) {
    const now = new Date()
    const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24))
    const formattedDate = expDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })

    if (diffDays < 0) {
      return { statusKey: 'expired', label: `หมดอายุ (${formattedDate})`, color: '#9f1239', bg: '#ffe4e6' }
    } else if (diffDays <= 60) {
      return { statusKey: 'expiring', label: `ใกล้หมดอายุ (${formattedDate})`, color: '#92400e', bg: '#fef3c7' }
    } else {
      return { statusKey: 'active', label: `ปกติ (${formattedDate})`, color: '#15803d', bg: '#dcfce7' }
    }
  }

  return { statusKey: 'custom', label: expireStr, color: '#0369a1', bg: '#e0f2fe' }
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

const emptyLeasingForm = {
  'Asset NO.': '',
  'Type': '',
  'Asset Name': '',
  'Brand': '',
  'Model': '',
  'SerialNumber': '',
  'Purchase': '',
  'End of': '',
  'Dept.': '',
  'ผู้ถือครอง 1': '',
  'ผู้ถือครอง 2': '',
  'ผู้ถือครอง 3': '',
  'ผู้รับผิดชอบ': '',
  'Location': '',
  'Remark': ''
}

function App() {
  const [session, setSession] = useState(null)
  const [userRole, setUserRole] = useState('viewer')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)

  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [changePasswordInput, setChangePasswordInput] = useState('')
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [profilesList, setProfilesList] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  const [mainTab, setMainTab] = useState('dashboard')

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

  const [leasingList, setLeasingList] = useState([])
  const [loadingLeasing, setLoadingLeasing] = useState(true)
  const [leasingSearch, setLeasingSearch] = useState('')
  const [selectedLeasing, setSelectedLeasing] = useState(null)
  const [isLeasingFormOpen, setIsLeasingFormOpen] = useState(false)
  const [editingLeasing, setEditingLeasing] = useState(null)
  const [leasingFormData, setLeasingFormData] = useState(emptyLeasingForm)
  const [leasingSubmitting, setLeasingSubmitting] = useState(false)

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
      loadLeasingData()
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

  async function handleSendResetEmail(e) {
    e.preventDefault()
    let targetEmail = resetEmail.trim()
    if (!targetEmail) {
      alert('กรุณาระบุ Username หรืออีเมล')
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
      alert('ตั้งค่ารหัสผ่านใหม่เรียบร้อยแล้ว')
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

  async function handleChangePasswordSubmit(e) {
    e.preventDefault()
    if (changePasswordInput !== confirmPasswordInput) {
      alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    if (changePasswordInput.length < 6) {
      alert('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร')
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: changePasswordInput })
      if (error) throw error

      alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว')
      setChangePasswordInput('')
      setConfirmPasswordInput('')
      setIsChangePasswordOpen(false)
    } catch (err) {
      console.error('Change password error:', err)
      alert('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + err.message)
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

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

  async function handleAddViewerUser(e) {
    e.preventDefault()
    let formattedUserEmail = newUserEmail.trim()
    if (!formattedUserEmail || !newUserPassword.trim()) {
      alert('กรุณากรอก Username/อีเมล และรหัสผ่านให้ครบถ้วน')
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

      alert(`เพิ่มผู้ใช้งาน "${formattedUserEmail}" สิทธิ์ Viewer เรียบร้อยแล้ว`)
      setNewUserEmail('')
      setNewUserPassword('')
      setIsAddUserOpen(false)
      loadProfilesList()
    } catch (err) {
      console.error('Error adding user:', err)
      alert('เกิดข้อผิดพลาดในการเพิ่มผู้ใช้งาน: ' + err.message)
    } finally {
      setAddingUser(false)
    }
  }

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

  async function loadLeasingData() {
    setLoadingLeasing(true)
    try {
      const { data, error } = await supabase.from('leasing_assets').select('*')
      if (error) {
        console.error('Fetch leasing error:', error)
      } else if (data) {
        const validLeasing = data.filter(item => {
          const no = item['Asset NO.'] || item.asset_no
          return no && String(no).trim() !== '' && String(no) !== 'Asset NO.'
        })
        setLeasingList(validLeasing)
      }
    } catch (err) {
      console.error('Error loading leasing data:', err)
    } finally {
      setLoadingLeasing(false)
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
          isResigned: isResigned,
          assets: []
        }
      }
      personMap[realHolder].assets.push(item)
    })

    return Object.values(personMap)
  }

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

  function getFilteredLeasingList() {
    let result = [...leasingList]
    if (leasingSearch.trim() !== '') {
      const term = leasingSearch.toLowerCase().trim()
      result = result.filter(item => JSON.stringify(item).toLowerCase().includes(term))
    }
    return result
  }

  function handleOpenReturnModal(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์ในการดำเนินการรายการนี้ (Admin Only)')
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

      alert(`บันทึกการคืนทรัพย์สินเข้า "${returnFormData.dept}" เรียบร้อยแล้ว`)
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
      alert('กรุณาระบุชื่ออุปกรณ์')
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
        alert('แก้ไขข้อมูลทรัพย์สินสำเร็จ')
      } else {
        const { error } = await supabase.from('assets_v2').insert([formData])
        if (error) throw error
        alert('เพิ่มทรัพย์สินสำเร็จ')
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
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบทรัพย์สิน "${assetIdentifier}" ออกจากระบบ?`)) return

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

      alert('ลบทรัพย์สินออกจากระบบเรียบร้อยแล้ว')
      setSelectedAsset(null)
      loadHardwareData()
    } catch (err) {
      console.error('Delete error:', err)
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message)
    } finally {
      setLoadingHardware(false)
    }
  }

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
      alert('กรุณาระบุชื่อซอฟต์แวร์')
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
        alert('แก้ไขข้อมูลลิขสิทธิ์ซอฟต์แวร์สำเร็จ')
      } else {
        const { error } = await supabase.from('software_assets').insert([softwareFormData])
        if (error) throw error
        alert('เพิ่มข้อมูลลิขสิทธิ์ซอฟต์แวร์สำเร็จ')
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
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการซอฟต์แวร์ "${swName}" ออกจากระบบ?`)) return

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

  function handleOpenAddLeasingModal() {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์เพิ่มอุปกรณ์เช่า (Admin Only)')
      return
    }
    setEditingLeasing(null)
    setLeasingFormData(emptyLeasingForm)
    setIsLeasingFormOpen(true)
  }

  function handleOpenEditLeasingModal(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์แก้ไขอุปกรณ์เช่า (Admin Only)')
      return
    }
    setEditingLeasing(item)
    setLeasingFormData({
      'Asset NO.': item['Asset NO.'] || item.asset_no || '',
      'Type': item['Type'] || item.type || '',
      'Asset Name': item['Asset Name'] || item.asset_name || '',
      'Brand': item['Brand'] || item.brand || '',
      'Model': item['Model'] || item.model || '',
      'SerialNumber': item['SerialNumber'] || item.serialnumber || '',
      'Purchase': item['Purchase'] || item.purchase || '',
      'End of': item['End of'] || item.end_of || '',
      'Dept.': item['Dept.'] || item.dept || '',
      'ผู้ถือครอง 1': item['ผู้ถือครอง 1'] || item.holder_1 || '',
      'ผู้ถือครอง 2': item['ผู้ถือครอง 2'] || item.holder_2 || '',
      'ผู้ถือครอง 3': item['ผู้ถือครอง 3'] || item.holder_3 || '',
      'ผู้รับผิดชอบ': item['ผู้รับผิดชอบ'] || item.responsible_person || '',
      'Location': item['Location'] || item.location || '',
      'Remark': item['Remark'] || item.remark || ''
    })
    setIsLeasingFormOpen(true)
  }

  async function handleLeasingFormSubmit(e) {
    e.preventDefault()
    if (!leasingFormData['Asset Name'].trim() && !leasingFormData['Asset NO.'].trim()) {
      alert('กรุณาระบุเลขทรัพย์สิน หรือชื่ออุปกรณ์เช่า')
      return
    }

    setLeasingSubmitting(true)
    try {
      if (editingLeasing) {
        let query = supabase.from('leasing_assets').update(leasingFormData)
        if (editingLeasing.id) {
          query = query.eq('id', editingLeasing.id)
        } else {
          query = query.eq('Asset NO.', editingLeasing['Asset NO.'])
        }
        const { error } = await query
        if (error) throw error
        alert('แก้ไขข้อมูลอุปกรณ์เช่าสำเร็จ')
      } else {
        const { error } = await supabase.from('leasing_assets').insert([leasingFormData])
        if (error) throw error
        alert('เพิ่มข้อมูลอุปกรณ์เช่าสำเร็จ')
      }

      setIsLeasingFormOpen(false)
      setSelectedLeasing(null)
      loadLeasingData()
    } catch (err) {
      console.error('Leasing Submit error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setLeasingSubmitting(false)
    }
  }

  async function handleDeleteLeasing(item) {
    if (userRole !== 'admin') {
      alert('คุณไม่มีสิทธิ์ลบอุปกรณ์เช่า (Admin Only)')
      return
    }
    const assetNo = item['Asset NO.'] || item['Asset Name'] || 'รายการนี้'
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบอุปกรณ์เช่า "${assetNo}" ออกจากระบบ?`)) return

    try {
      setLoadingLeasing(true)
      let query = supabase.from('leasing_assets').delete()
      if (item.id) {
        query = query.eq('id', item.id)
      } else {
        query = query.eq('Asset NO.', item['Asset NO.'])
      }
      const { error } = await query
      if (error) throw error

      alert('ลบข้อมูลอุปกรณ์เช่าเรียบร้อยแล้ว')
      setSelectedLeasing(null)
      loadLeasingData()
    } catch (err) {
      console.error('Delete leasing error:', err)
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message)
    } finally {
      setLoadingLeasing(false)
    }
  }

  function exportHardwareToCSV() {
    if (!allRawAssets || allRawAssets.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออก')
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
      alert('ไม่มีข้อมูลสำหรับส่งออก')
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
        `"${item['Contract Number'] || item.Contract_number || ''}"`,
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

  function exportLeasingToCSV() {
    if (!leasingList || leasingList.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออก')
      return
    }

    const headers = ['Asset NO.', 'Type', 'Asset Name', 'Brand', 'Model', 'SerialNumber', 'Purchase', 'End of', 'Dept.', 'ผู้ถือครอง 1', 'ผู้ถือครอง 2', 'ผู้ถือครอง 3', 'ผู้รับผิดชอบ', 'Location', 'Remark']
    const csvRows = [headers.join(',')]

    leasingList.forEach(item => {
      const row = [
        `"${item['Asset NO.'] || ''}"`,
        `"${item['Type'] || ''}"`,
        `"${(item['Asset Name'] || '').replace(/"/g, '""')}"`,
        `"${item['Brand'] || ''}"`,
        `"${item['Model'] || ''}"`,
        `"${item['SerialNumber'] || ''}"`,
        `"${item['Purchase'] || ''}"`,
        `"${item['End of'] || ''}"`,
        `"${item['Dept.'] || ''}"`,
        `"${item['ผู้ถือครอง 1'] || ''}"`,
        `"${item['ผู้ถือครอง 2'] || ''}"`,
        `"${item['ผู้ถือครอง 3'] || ''}"`,
        `"${item['ผู้รับผิดชอบ'] || ''}"`,
        `"${item['Location'] || ''}"`,
        `"${(item['Remark'] || '').replace(/"/g, '""')}"`
      ]
      csvRows.push(row.join(','))
    })

    const csvContent = '\uFEFF' + csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `Leasing_Assets_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const hwAgeOldCount = allRawAssets.filter(item => getAssetAgeInfo(item).ageNum >= 4).length
  const hwAgeMidCount = allRawAssets.filter(item => getAssetAgeInfo(item).ageNum >= 2 && getAssetAgeInfo(item).ageNum < 4).length
  const hwAgeNewCount = allRawAssets.filter(item => getAssetAgeInfo(item).ageNum >= 0 && getAssetAgeInfo(item).ageNum < 2).length
  const hwAgeUnknownCount = allRawAssets.filter(item => getAssetAgeInfo(item).ageNum === -1).length

  const swExpiredList = softwareList.filter(item => getSoftwareExpireStatus(item['Expire Date'] || item.expire_date).statusKey === 'expired')
  const swExpiringList = softwareList.filter(item => getSoftwareExpireStatus(item['Expire Date'] || item.expire_date).statusKey === 'expiring')
  const swLifetimeCount = softwareList.filter(item => getSoftwareExpireStatus(item['Expire Date'] || item.expire_date).statusKey === 'lifetime').length
  const swActiveCount = softwareList.filter(item => getSoftwareExpireStatus(item['Expire Date'] || item.expire_date).statusKey === 'active').length

  const deptCountMap = {}
  allRawAssets.forEach(item => {
    const d = item.dept || 'ไม่ระบุแผนก'
    deptCountMap[d] = (deptCountMap[d] || 0) + 1
  })
  const topDepts = Object.entries(deptCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const vendorCountMap = {}
  softwareList.forEach(item => {
    const v = item['Vendor'] || item.vendor || 'ไม่ระบุ Vendor'
    vendorCountMap[v] = (vendorCountMap[v] || 0) + 1
  })
  const topVendors = Object.entries(vendorCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (isResettingPassword) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', fontFamily: 'Sarabun, Inter, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#ffffff', padding: '36px 32px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', borderRadius: '6px', fontWeight: 600, padding: '4px 8px', fontSize: '12px', display: 'inline-block', marginBottom: '10px' }}>
              🔑 รีเซ็ตรหัสผ่าน (Reset Password)
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: 0 }}>กำหนดรหัสผ่านใหม่</h2>
            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 400, marginTop: '4px' }}>ระบุรหัสผ่านใหม่ที่คุณต้องการใช้งานสำหรับบัญชีนี้</p>
          </div>

          <form onSubmit={handleUpdateNewPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>รหัสผ่านใหม่ (New Password)</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="ความยาวอย่างน้อย 6 ตัวอักษร" 
                required 
                style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400, boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a', display: 'block', marginBottom: '6px' }}>ยืนยันรหัสผ่านใหม่ (Confirm Password)</label>
              <input 
                type="password" 
                value={confirmNewPassword} 
                onChange={e => setConfirmNewPassword(e.target.value)} 
                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" 
                required 
                style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400, boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
              />
            </div>

            <button 
              type="submit" 
              disabled={authLoading} 
              style={{ 
                width: '100%', 
                height: '36px',
                backgroundColor: '#4f46e5', 
                color: '#ffffff', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontSize: '13px', 
                fontWeight: 500, 
                marginTop: '8px'
              }}
            >
              {authLoading ? 'กำลังบันทึกข้อมูล...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Sarabun, Inter, sans-serif', backgroundColor: '#f8fafc' }}>
        <div style={{
          flex: '0 0 32%',
          minWidth: '320px',
          backgroundColor: '#ffffff',
          backgroundImage: 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px), linear-gradient(135deg, #ffffff 0%, #f3e8ff 100%)',
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff', color: '#6b21a8', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid #e9d5ff', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <DragonflyLogo size={22} color="#6b21a8" />
              IT Asset Management System
            </div>
            
            <h1 style={{ fontSize: '22px', fontWeight: 600, marginTop: '28px', marginBottom: '12px', lineHeight: 1.35, letterSpacing: '-0.3px', color: '#0f172a' }}>
              ระบบบริหารจัดการ<br />ทรัพย์สินไอทีองค์กร
            </h1>
            
            <p style={{ color: '#475569', fontSize: '13px', lineHeight: 1.6, fontWeight: 400 }}>
              ระบบศูนย์กลางสำหรับควบคุม ตรวจสอบ และติดตามสถานะฮาร์ดแวร์ ซอฟต์แวร์ ตลอดจนสัญญาอุปกรณ์เช่า
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ backgroundColor: '#f3e8ff', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>📊</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>System Dashboard</div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>รายงานวิเคราะห์วงจรชีวิตทรัพย์สินและงบประมาณ</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ backgroundColor: '#f3e8ff', padding: '6px 8px', borderRadius: '6px', fontSize: '14px' }}>🔑</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Role-Based Access Control</div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>การควบคุมสิทธิ์ใช้งานตามบทบาท (Admin / Viewer)</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400, borderTop: '1px solid #cbd5e1', paddingTop: '14px' }}>
            © {new Date().getFullYear()} Enterprise IT Asset Management.
          </div>
        </div>

        <div style={{
          flex: '1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          backgroundColor: '#f8fafc',
          boxSizing: 'border-box'
        }}>
          <div style={{ width: '100%', maxWidth: '380px', backgroundColor: '#ffffff', padding: '36px 32px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)', border: '1px solid #e2e8f0' }}>
            {isForgotPassword ? (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', borderRadius: '6px', fontWeight: 600, padding: '3px 8px', fontSize: '12px', display: 'inline-block', marginBottom: '10px' }}>
                    Password Recovery
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: 0 }}>ขอลิงก์รีเซ็ตรหัสผ่าน</h2>
                  <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 400, marginTop: '4px' }}>กรอก Username หรืออีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p>
                </div>

                {resetSent ? (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ color: '#166534', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>ส่งคำขอเรียบร้อยแล้ว</div>
                    <p style={{ color: '#15803d', fontSize: '12px', fontWeight: 400, margin: 0, lineHeight: 1.5 }}>
                      ระบบได้ส่งลิงก์การตั้งค่ารหัสผ่านใหม่ไปยังอีเมลของคุณเรียบร้อยแล้ว
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
                        style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400, boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
                      />
                    </div>

                    <button 
                      type="submit" 
                      disabled={authLoading} 
                      style={{ 
                        width: '100%', 
                        height: '36px',
                        backgroundColor: '#4f46e5', 
                        color: '#ffffff', 
                        border: 'none', 
                        borderRadius: '6px', 
                        cursor: 'pointer', 
                        fontSize: '13px', 
                        fontWeight: 500, 
                        marginTop: '4px'
                      }}
                    >
                      {authLoading ? 'กำลังดำเนินการ...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
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
                    ◀ กลับสู่หน้าเข้าสู่ระบบ
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <DragonflyLogo size={32} color="#6b21a8" />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b21a8', backgroundColor: '#f3e8ff', padding: '2px 8px', borderRadius: '6px' }}>IT Portal</span>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: 0 }}>เข้าสู่ระบบบริหารทรัพย์สิน</h2>
                  <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 400, marginTop: '4px' }}>ระบุ Username หรืออีเมลประจำตำแหน่งเพื่อเข้าใช้งาน</p>
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
                      style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400, boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
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
                      style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400, boxSizing: 'border-box', color: '#0f172a', outline: 'none' }} 
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={authLoading} 
                    style={{ 
                      width: '100%', 
                      height: '36px',
                      backgroundColor: '#4f46e5', 
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
  const filteredLeasing = getFilteredLeasingList()

  const totalSoftwareLicenseCount = softwareList.reduce((sum, item) => sum + (Number(item['No. of License'] || item.no_of_license) || 0), 0)
  const vendorsList = [...new Set(softwareList.map(item => item['Vendor'] || item.vendor).filter(Boolean))].sort()
  const installedOnList = [...new Set(softwareList.map(item => item['Installed on'] || item.installed_on).filter(Boolean))].sort()

  const navMenuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', count: null },
  { id: 'hardware', label: 'Hardware Assets', icon: '📦', count: allRawAssets.length },
  { id: 'software', label: 'Software Licenses', icon: '💻', count: softwareList.length },
  { id: 'leasing', label: 'Leased Assets', icon: '📋', count: leasingList.length },
]

  const activeMenu = navMenuItems.find(m => m.id === mainTab)

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'Sarabun, Inter, sans-serif', color: '#0f172a' }}>
      
      {/* Light Clean Header Bar */}
      <header style={{ backgroundColor: '#ffffff', color: '#0f172a', padding: '10px 24px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', boxSizing: 'border-box', position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          
          {/* Hamburger Menu Button (☰) */}
          <button
            onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
            title="เปิด/ปิด เมนูหลัก"
            style={{
              background: 'none',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              backgroundColor: isNavMenuOpen ? '#f1f5f9' : '#ffffff',
              transition: 'background-color 0.2s'
            }}
          >
            ☰
          </button>

          {/* เปลี่ยนจาก <div> เดิม เป็นโค้ดนี้ */}
<div 
  onClick={() => setMainTab('dashboard')}
  title="กลับสู่หน้า Dashboard"
  style={{ 
    display: 'flex', 
    alignItems: 'center', 
    gap: '10px', 
    cursor: 'pointer',
    userSelect: 'none'
  }}
>
  <DragonflyLogo size={26} color="#6b21a8" />
  <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '15px', letterSpacing: '-0.2px' }}>
    IT Asset Management
  </span>
</div>

          <div style={{ borderLeft: '1px solid #e2e8f0', height: '20px', margin: '0 6px' }} />

          {/* Current Page Title */}
          <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{activeMenu?.icon}</span>
            <span>{activeMenu?.label}</span>
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          
          {/* Settings Button */}
          <button
            onClick={() => {
              setIsSettingsOpen(true)
              setIsProfileMenuOpen(false)
            }}
            title="ตั้งค่าระบบ / ส่งออกข้อมูล CSV"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            ⚙️
          </button>

          {/* User Profile Avatar */}
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: '#f3e8ff',
              border: '1px solid #d8b4fe',
              color: '#6b21a8',
              fontWeight: 600,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {getUserInitials(session?.user?.email)}
          </button>

          {isProfileMenuOpen && (
            <>
              <div 
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} 
                onClick={() => setIsProfileMenuOpen(false)} 
              />

              <div style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '320px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                zIndex: 100,
                overflow: 'hidden',
                color: '#0f172a'
              }}>
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                    IT Asset Management
                  </span>
                  <button 
                    onClick={handleLogout}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Sign out
                  </button>
                </div>

                <div style={{ padding: '20px 16px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 500,
                    color: '#334155',
                    flexShrink: 0
                  }}>
                    {getUserInitials(session?.user?.email)}
                  </div>

                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {session?.user?.email?.split('@')[0]}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, wordBreak: 'break-all', marginTop: '2px' }}>
                      {session?.user?.email}
                    </div>

                    <div style={{ marginTop: '6px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        backgroundColor: userRole === 'admin' ? '#f3e8ff' : '#f1f5f9',
                        color: userRole === 'admin' ? '#6b21a8' : '#475569',
                        fontWeight: 600 
                      }}>
                        {userRole === 'admin' ? 'ADMIN' : 'VIEWER'}
                      </span>
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false)
                          setIsSettingsOpen(true)
                          setIsChangePasswordOpen(true)
                        }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 400, textAlign: 'left', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        เปลี่ยนรหัสผ่าน (Change password)
                      </button>

                      {userRole === 'admin' && (
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false)
                            setIsSettingsOpen(true)
                            setIsAddUserOpen(true)
                          }}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 400, textAlign: 'left', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          ตั้งค่า / เพิ่มผู้ใช้ (Settings)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', backgroundColor: '#ffffff' }}>
                    👤
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{ background: 'none', border: 'none', color: '#0f172a', fontSize: '12px', fontWeight: 400, cursor: 'pointer', padding: 0 }}
                  >
                    Sign in with a different account
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </header>

      {/* Navigation Sidebar Drawer (Light Theme) */}
      {isNavMenuOpen && (
        <>
          <div
            onClick={() => setIsNavMenuOpen(false)}
            style={{
              position: 'fixed',
              top: '56px',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(100, 116, 139, 0.25)',
              backdropFilter: 'blur(2px)',
              zIndex: 998
            }}
          />

          <div
            style={{
              position: 'fixed',
              top: '56px',
              left: 0,
              width: '270px',
              bottom: 0,
              backgroundColor: '#ffffff',
              color: '#0f172a',
              boxShadow: '4px 0 20px rgba(0,0,0,0.06)',
              borderRight: '1px solid #e2e8f0',
              zIndex: 999,
              display: 'flex',
              flexDirection: 'column',
              paddingTop: '12px'
            }}
          >
            <div style={{ padding: '8px 20px 12px', fontSize: '11px', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px' }}>
              MAIN NAVIGATION
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {navMenuItems.map((item) => {
                const isActive = mainTab === item.id

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMainTab(item.id)
                      setIsNavMenuOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 20px',
                      border: 'none',
                      backgroundColor: isActive ? '#f3e8ff' : 'transparent',
                      borderLeft: isActive ? '4px solid #6b21a8' : '4px solid transparent',
                      color: isActive ? '#6b21a8' : '#475569',
                      fontSize: '13.5px',
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '16px' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>

                    {item.count !== null && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: isActive ? '#e9d5ff' : '#f1f5f9',
                        color: isActive ? '#6b21a8' : '#64748b',
                        fontWeight: 500
                      }}>
                        {item.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main style={{ padding: '20px 24px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* Page Header */}
<div style={{ marginBottom: '16px' }}>
  <h1 style={{ color: '#0f172a', fontWeight: 600, fontSize: '18px', margin: 0 }}>
    {mainTab === 'dashboard' && 'Dashboard Overview'}
    {mainTab === 'hardware' && 'Hardware Assets Management'}
    {mainTab === 'software' && 'Software License Management'}
    {mainTab === 'leasing' && 'Leased Assets Management'}
  </h1>
  <p style={{ color: '#64748b', fontSize: '13px', fontWeight: 400, margin: '2px 0 0' }}>
    {mainTab === 'dashboard' && 'Executive summary, asset lifecycle analytics, and license status'}
    {mainTab === 'hardware' && 'Centralized control for hardware devices, assignments, and returns'}
    {mainTab === 'software' && 'Software license inventory, vendor management, and expiration tracking'}
    {mainTab === 'leasing' && 'Tracking leased equipment contracts, assignees, and deployment locations'}
  </p>
</div>

        {/* VIEW 0: ANALYTICS DASHBOARD */}
        {mainTab === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px' }}>จำนวนอุปกรณ์ฮาร์ดแวร์ทั้งหมด</span>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '24px' }}>{allRawAssets.length.toLocaleString()}</span>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: hwAgeOldCount > 0 ? '#e11d48' : '#166534', fontWeight: 400 }}>
                  ครบรอบการเปลี่ยนเครื่อง: {hwAgeOldCount} รายการ ({allRawAssets.length ? Math.round((hwAgeOldCount / allRawAssets.length) * 100) : 0}%)
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px' }}>จำนวนลิขสิทธิ์ซอฟต์แวร์ทั้งหมด</span>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '24px' }}>{totalSoftwareLicenseCount.toLocaleString()}</span>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>สิทธิ์</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#0369a1', fontWeight: 400 }}>
                  สิทธิ์ประเภทตลอดชีพ (Lifetime): {swLifetimeCount} รายการ
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px' }}>จำนวนอุปกรณ์เช่า (Leasing)</span>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '24px' }}>{leasingList.length.toLocaleString()}</span>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b21a8', fontWeight: 400 }}>
                  อุปกรณ์ภายใต้สัญญาเช่าองค์กร
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px' }}>การจัดการความเสี่ยงลิขสิทธิ์</span>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ color: (swExpiredList.length + swExpiringList.length) > 0 ? '#b91c1c' : '#166534', fontWeight: 700, fontSize: '24px' }}>
                    {swExpiredList.length + swExpiringList.length}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: swExpiredList.length > 0 ? '#dc2626' : '#d97706', fontWeight: 400 }}>
                  หมดอายุแล้ว: {swExpiredList.length} | ใกล้หมดอายุ: {swExpiringList.length}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>วิเคราะห์วงจรชีวิตฮาร์ดแวร์ (Hardware Lifecycle)</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>การประเมินตามอายุการใช้งาน</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: '#e11d48', fontWeight: 500 }}>ควรวางแผนทดแทน (อายุ ≥ 4 ปี)</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{hwAgeOldCount} รายการ ({allRawAssets.length ? Math.round((hwAgeOldCount / allRawAssets.length) * 100) : 0}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${allRawAssets.length ? (hwAgeOldCount / allRawAssets.length) * 100 : 0}%`, height: '100%', backgroundColor: '#f43f5e' }}></div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: '#d97706', fontWeight: 500 }}>ระยะเวลาใช้งานปานกลาง (อายุ 2 - 4 ปี)</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{hwAgeMidCount} รายการ ({allRawAssets.length ? Math.round((hwAgeMidCount / allRawAssets.length) * 100) : 0}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${allRawAssets.length ? (hwAgeMidCount / allRawAssets.length) * 100 : 0}%`, height: '100%', backgroundColor: '#f59e0b' }}></div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: '#166534', fontWeight: 500 }}>ระยะเริ่มต้นการใช้งาน (อายุ &lt; 2 ปี)</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{hwAgeNewCount} รายการ ({allRawAssets.length ? Math.round((hwAgeNewCount / allRawAssets.length) * 100) : 0}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${allRawAssets.length ? (hwAgeNewCount / allRawAssets.length) * 100 : 0}%`, height: '100%', backgroundColor: '#10b981' }}></div>
                    </div>
                  </div>

                  {hwAgeUnknownCount > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span style={{ color: '#64748b', fontWeight: 400 }}>ไม่ระบุข้อมูลปีจัดซื้อ</span>
                        <span style={{ fontWeight: 500, color: '#475569' }}>{hwAgeUnknownCount} รายการ</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${allRawAssets.length ? (hwAgeUnknownCount / allRawAssets.length) * 100 : 0}%`, height: '100%', backgroundColor: '#94a3b8' }}></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>สถานะและสุขภาพลิขสิทธิ์ซอฟต์แวร์ (License Health)</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>การจำแนกสถานะสัญญา</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#9f1239', fontWeight: 500 }}>หมดอายุ (Expired)</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#9f1239', marginTop: '4px' }}>{swExpiredList.length} <span style={{ fontSize: '11px', fontWeight: 400 }}>รายการ</span></div>
                  </div>

                  <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#92400e', fontWeight: 500 }}>ใกล้หมดอายุ (Expiring in 60 days)</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#92400e', marginTop: '4px' }}>{swExpiringList.length} <span style={{ fontSize: '11px', fontWeight: 400 }}>รายการ</span></div>
                  </div>

                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#166534', fontWeight: 500 }}>ตลอดชีพ (Lifetime)</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#166534', marginTop: '4px' }}>{swLifetimeCount} <span style={{ fontSize: '11px', fontWeight: 400 }}>รายการ</span></div>
                  </div>

                  <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: 500 }}>ปกติ (Active)</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0369a1', marginTop: '4px' }}>{swActiveCount} <span style={{ fontSize: '11px', fontWeight: 400 }}>รายการ</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: '14px' }}>
                  5 แผนกที่มีจำนวนฮาร์ดแวร์สูงสุด
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {topDepts.map(([deptName, count], idx) => {
                    const maxCount = topDepts[0][1] || 1
                    const pct = Math.round((count / maxCount) * 100)

                    return (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 400, color: '#0f172a' }}>{idx + 1}. {deptName}</span>
                          <span style={{ fontWeight: 500, color: '#475569' }}>{count} รายการ</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#4f46e5' }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: '14px' }}>
                  5 ผู้จัดจำหน่ายซอฟต์แวร์หลัก (Vendors)
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {topVendors.map(([vendorName, count], idx) => {
                    const maxCount = topVendors[0][1] || 1
                    const pct = Math.round((count / maxCount) * 100)

                    return (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 400, color: '#0f172a' }}>{idx + 1}. {vendorName}</span>
                          <span style={{ fontWeight: 500, color: '#0369a1' }}>{count} รายการ</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#0284c7' }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 1: HARDWARE ASSETS MANAGEMENT */}
        {mainTab === 'hardware' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>จำนวนทรัพย์สินฮาร์ดแวร์</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '22px' }}>{allRawAssets.length.toLocaleString()}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>📦</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>ประเภทสิทธิ์การถือครอง</span>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: 600 }}>
                      {viewMode === 'all' && 'ทรัพย์สินทั้งหมด'}
                      {viewMode === 'person' && 'ถือครองรายบุคคล'}
                      {viewMode === 'dept' && 'ระดับแผนก / ส่วนกลาง'}
                    </span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>
                  {viewMode === 'person' ? '👤' : viewMode === 'dept' ? '🏢' : '🌐'}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>จำนวนหมวดหมู่อุปกรณ์</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '22px' }}>{summary.length}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>หมวดหมู่</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>🏷️</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>ผลการกรองข้อมูล</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '22px' }}>
                      {totalFilteredCount.toLocaleString()}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>🎯</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              
              <div style={{ padding: '12px 16px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px', backgroundColor: '#f8fafc' }}>
                <button 
                  onClick={() => { setViewMode('all'); setCurrentPage(1); }}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '6px 6px 0 0',
                    border: 'none',
                    borderBottom: viewMode === 'all' ? '2px solid #4f46e5' : '2px solid transparent',
                    backgroundColor: viewMode === 'all' ? '#ffffff' : 'transparent',
                    color: viewMode === 'all' ? '#4f46e5' : '#64748b',
                    fontWeight: viewMode === 'all' ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  รายการทั้งหมด ({allRawAssets.length.toLocaleString()})
                </button>

                <button 
                  onClick={() => { setViewMode('person'); setCurrentPage(1); }}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '6px 6px 0 0',
                    border: 'none',
                    borderBottom: viewMode === 'person' ? '2px solid #4f46e5' : '2px solid transparent',
                    backgroundColor: viewMode === 'person' ? '#ffffff' : 'transparent',
                    color: viewMode === 'person' ? '#4f46e5' : '#64748b',
                    fontWeight: viewMode === 'person' ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  ถือครองรายบุคคล
                </button>

                <button 
                  onClick={() => { setViewMode('dept'); setCurrentPage(1); }}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '6px 6px 0 0',
                    border: 'none',
                    borderBottom: viewMode === 'dept' ? '2px solid #4f46e5' : '2px solid transparent',
                    backgroundColor: viewMode === 'dept' ? '#ffffff' : 'transparent',
                    color: viewMode === 'dept' ? '#4f46e5' : '#64748b',
                    fontWeight: viewMode === 'dept' ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  ถือครองระดับแผนก/ส่วนกลาง
                </button>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '14px' }}>
                    {viewMode === 'all' && 'รายการทรัพย์สินฮาร์ดแวร์ทั้งหมด'}
                    {viewMode === 'person' && `รายการผู้ถือครองรายบุคคล (${groupedPersons.length} ราย)`}
                    {viewMode === 'dept' && 'รายการทรัพย์สินส่วนกลาง/แผนก'}
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
                          fontWeight: personDisplayFormat === 'cards' ? 600 : 400,
                          backgroundColor: personDisplayFormat === 'cards' ? '#ffffff' : 'transparent',
                          color: personDisplayFormat === 'cards' ? '#0f172a' : '#64748b'
                        }}
                      >
                        รูปแบบการ์ด
                      </button>
                      <button
                        onClick={() => setPersonDisplayFormat('table')}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: personDisplayFormat === 'table' ? 600 : 400,
                          backgroundColor: personDisplayFormat === 'table' ? '#ffffff' : 'transparent',
                          color: personDisplayFormat === 'table' ? '#0f172a' : '#64748b'
                        }}
                      >
                        รูปแบบตาราง
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {userRole === 'admin' && (
                    <button 
                      onClick={handleOpenAddModal}
                      style={{
                        backgroundColor: '#4f46e5',
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
                      เพิ่มทรัพย์สิน
                    </button>
                  )}

                  <select
                    style={{
                      height: '36px',
                      padding: '0 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 400
                    }}
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="">หมวดหมู่อุปกรณ์ทั้งหมด ({summary.length})</option>
                    {summary.map((cat, idx) => (
                      <option key={idx} value={cat.asset_type}>
                        {cat.asset_type} ({cat.total_count})
                      </option>
                    ))}
                  </select>

                  <select 
                    style={{ 
                      height: '36px',
                      padding: '0 12px', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      fontSize: '13px', 
                      outline: 'none', 
                      backgroundColor: '#ffffff', 
                      color: '#0f172a', 
                      fontWeight: 400
                    }}
                    value={selectedDept}
                    onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="">แผนกทั้งหมด ({deptList.length})</option>
                    <option value="__UNASSIGNED__">ไม่ระบุแผนก</option>
                    {deptList.map((dept, idx) => (
                      <option key={idx} value={dept}>{dept}</option>
                    ))}
                  </select>

                  <input 
                    type="text" 
                    placeholder="ค้นหา Asset No, ชื่อผู้ถือครอง..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    style={{ 
                      height: '36px',
                      width: '220px',
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      padding: '0 12px', 
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#0f172a',
                      backgroundColor: '#ffffff',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {viewMode === 'person' && personDisplayFormat === 'cards' ? (
                <div style={{ padding: '16px 20px' }}>
                  {loadingHardware ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>กำลังดึงข้อมูล...</div>
                  ) : groupedPersons.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>ไม่พบรายชื่อพนักงานตามเงื่อนไขการค้นหา</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {groupedPersons.map((person, pIdx) => (
                        <div key={pIdx} style={{ border: '1px solid #e2e8f0', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
                          <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: person.isResigned ? '#dc2626' : '#0f172a', fontWeight: 600, fontSize: '14px' }}>{person.name}</div>
                              <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>แผนก: {person.dept}</div>
                            </div>
                            <span style={{ backgroundColor: '#f1f5f9', color: '#0f172a', borderRadius: '12px', fontSize: '11px', padding: '2px 8px', fontWeight: 500 }}>{person.assets.length} รายการ</span>
                          </div>

                          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {person.assets.map((asset, aIdx) => {
                              const ageInfo = getAssetAgeInfo(asset)
                              const icon = getAssetTypeIcon(asset.type)

                              return (
                                <div 
                                  key={aIdx} 
                                  onClick={() => setSelectedAsset(asset)}
                                  style={{ cursor: 'pointer', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                    <span style={{ fontSize: '16px' }}>{icon}</span>
                                    <div style={{ overflow: 'hidden' }}>
                                      <div style={{ color: '#0f172a', fontWeight: 400, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.asset_name || 'อุปกรณ์ไอที'}</div>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                        <span style={{ fontSize: '11px', padding: '1px 6px', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: '4px', fontWeight: 500, fontFamily: 'monospace', border: '1px solid #e2e8f0' }}>{asset.asset_no || '-'}</span>
                                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>{ageInfo.label}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {userRole === 'admin' && (
                                    <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                      <button onClick={() => handleOpenReturnModal(asset)} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 400 }}>คืนทรัพย์สิน</button>
                                      <button onClick={() => handleOpenEditModal(asset)} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 400 }}>แก้ไข</button>
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
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  {loadingHardware ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>กำลังดึงข้อมูล...</div>
                  ) : displayedAssets.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>ไม่พบข้อมูลตามเงื่อนไขการค้นหา</div>
                  ) : (
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1150px', tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ASSET NO</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ชื่ออุปกรณ์</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', width: '200px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ผู้ถือครองหลัก</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ประเภทถือครอง</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>หมวดหมู่</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>แผนกสังกัด</th>
                          <th style={{ padding: '12px 20px 12px 12px', textAlign: 'center', width: '210px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedAssets.map((item, index) => {
                          const { realHolder, holderType, isResigned } = getRealAssetHolder(item)

                          return (
                            <tr key={index} onClick={() => setSelectedAsset(item)} style={{ backgroundColor: isResigned ? '#fff1f2' : 'transparent', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '12px', color: '#0f172a', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                  {item.asset_no || '-'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 400, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.asset_name || '-'}
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ color: isResigned ? '#e11d48' : '#0f172a', fontWeight: 400, fontSize: '13px' }}>{realHolder}</span>
                                  {isResigned && <span style={{ backgroundColor: '#ffe4e6', color: '#9f1239', fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px' }}>พนักงานลาออก</span>}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {holderType === 'PERSON' ? (
                                  <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 500, fontSize: '11px', padding: '3px 8px', borderRadius: '20px' }}>รายบุคคล</span>
                                ) : (
                                  <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 400, fontSize: '11px', padding: '3px 8px', borderRadius: '20px' }}>ส่วนกลาง</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: 400, color: '#475569' }}>{item.type || '-'}</td>
                              <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: 400, color: '#475569' }}>{item.dept || '-'}</td>
                              <td style={{ padding: '12px 20px 12px 12px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                {userRole === 'admin' ? (
                                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                    {holderType === 'PERSON' ? (
                                      <button onClick={() => handleOpenReturnModal(item)} title="คืนทรัพย์สินเข้าส่วนกลาง" style={{ backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', fontWeight: 400, fontSize: '11px', padding: '0 10px', height: '30px', borderRadius: '6px', cursor: 'pointer' }}>คืนทรัพย์สิน</button>
                                    ) : (
                                      <div style={{ width: '68px', height: '30px' }} />
                                    )}
                                    <button onClick={() => handleOpenEditModal(item)} title="แก้ไข" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '0 8px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>แก้ไข</button>
                                    <button onClick={() => handleDeleteAsset(item)} title="ลบ" style={{ backgroundColor: '#fff1f2', border: 'none', padding: '0 8px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400, color: '#e11d48' }}>ลบ</button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>สิทธิ์อ่านเท่านั้น (Read-only)</span>
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

              {(viewMode !== 'person' || personDisplayFormat === 'table') && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>
                    หน้า {currentPage} จาก {totalPages} (รวม {totalFilteredCount.toLocaleString()} รายการ)
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button disabled={currentPage === 1 || loadingHardware} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} style={{ height: '32px', padding: '0 14px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: currentPage === 1 ? '#f1f5f9' : '#ffffff', color: currentPage === 1 ? '#cbd5e1' : '#0f172a', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 400 }}>◀ ก่อนหน้า</button>
                    <button disabled={currentPage >= totalPages || loadingHardware} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} style={{ height: '32px', padding: '0 14px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: currentPage >= totalPages ? '#f1f5f9' : '#ffffff', color: currentPage >= totalPages ? '#cbd5e1' : '#0f172a', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 400 }}>ถัดไป ▶</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* VIEW 2: SOFTWARE LICENSES MANAGEMENT */}
        {mainTab === 'software' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>จำนวนรายการซอฟต์แวร์</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '22px' }}>{softwareList.length}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>💻</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>จำนวนสิทธิ์การใช้งานรวม (Licenses)</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '22px' }}>{totalSoftwareLicenseCount.toLocaleString()}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>สิทธิ์</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>🔑</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>ลิขสิทธิ์ประเภทตลอดชีพ</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#166534', fontWeight: 700, fontSize: '22px' }}>{swLifetimeCount}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>♾️</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: 400, fontSize: '12px', display: 'block' }}>สัญญาประเภทสมัครสมาชิก / รายปี</span>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ color: '#0284c7', fontWeight: 700, fontSize: '22px' }}>{softwareList.length - swLifetimeCount}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 400 }}>รายการ</span>
                  </div>
                </div>
                <div style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '8px', padding: '10px', fontSize: '18px' }}>📅</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '14px' }}>
                  รายการลิขสิทธิ์ซอฟต์แวร์ทั้งหมด ({filteredSoftware.length} รายการ)
                </span>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {userRole === 'admin' && (
                    <button 
                      onClick={handleOpenAddSoftwareModal}
                      style={{
                        backgroundColor: '#4f46e5',
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
                      เพิ่มซอฟต์แวร์
                    </button>
                  )}

                  <select
                    style={{
                      height: '36px',
                      padding: '0 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 400
                    }}
                    value={swSelectedVendor}
                    onChange={(e) => setSwSelectedVendor(e.target.value)}
                  >
                    <option value="">ผู้จัดจำหน่ายทั้งหมด ({vendorsList.length})</option>
                    {vendorsList.map((vendor, idx) => (
                      <option key={idx} value={vendor}>{vendor}</option>
                    ))}
                  </select>

                  <select 
                    style={{ 
                      height: '36px',
                      padding: '0 12px', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      fontSize: '13px', 
                      outline: 'none', 
                      backgroundColor: '#ffffff', 
                      color: '#0f172a', 
                      fontWeight: 400
                    }}
                    value={swSelectedInstalledOn}
                    onChange={(e) => setSwSelectedInstalledOn(e.target.value)}
                  >
                    <option value="">ตำแหน่งติดตั้งทั้งหมด ({installedOnList.length})</option>
                    {installedOnList.map((loc, idx) => (
                      <option key={idx} value={loc}>{loc}</option>
                    ))}
                  </select>

                  <input 
                    type="text" 
                    placeholder="ค้นหาชื่อซอฟต์แวร์, เลขที่สัญญา..." 
                    value={swSearchTerm}
                    onChange={(e) => setSwSearchTerm(e.target.value)}
                    style={{ 
                      height: '36px',
                      width: '220px',
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      padding: '0 12px', 
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#0f172a',
                      backgroundColor: '#ffffff',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto', width: '100%' }}>
                {loadingSoftware ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>กำลังดึงข้อมูลซอฟต์แวร์...</div>
                ) : filteredSoftware.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>ไม่พบข้อมูลซอฟต์แวร์ตามเงื่อนไขการค้นหา</div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', width: '150px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>รหัส / ASSET NO</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ชื่อซอฟต์แวร์ (SOFTWARE NAME)</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>VERSION</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ตำแหน่งติดตั้ง</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>VENDOR</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '100px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>LICENSE</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '190px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>วันหมดอายุ / สถานะสัญญา</th>
                        <th style={{ padding: '12px 20px 12px 12px', textAlign: 'center', width: '150px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>การจัดการ</th>
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
                              <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '12px', color: '#0f172a', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                {assetNo}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 400, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {swName}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '13px', fontWeight: 400, color: '#475569' }}>
                              {version}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 400, fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                                {installedOn}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '13px', fontWeight: 400, color: '#475569', whiteSpace: 'nowrap' }}>
                              {vendor}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ fontWeight: 500, fontSize: '13px', color: '#0f172a' }}>{licenseCount}</span> <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>สิทธิ์</span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ backgroundColor: statusInfo.bg, color: statusInfo.color, fontWeight: 500, fontSize: '11px', padding: '3px 8px', borderRadius: '20px' }}>
                                {statusInfo.label}
                              </span>
                            </td>

                            <td style={{ padding: '12px 20px 12px 12px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              {userRole === 'admin' ? (
                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                  <button onClick={() => handleOpenEditSoftwareModal(item)} title="แก้ไข" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '0 8px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>แก้ไข</button>
                                  <button onClick={() => handleDeleteSoftware(item)} title="ลบ" style={{ backgroundColor: '#fff1f2', border: 'none', padding: '0 8px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400, color: '#e11d48' }}>ลบ</button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>สิทธิ์อ่านเท่านั้น (Read-only)</span>
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

        {/* VIEW 3: LEASING ASSETS MANAGEMENT */}
        {mainTab === 'leasing' && (
          <div>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '14px' }}>
                  รายการอุปกรณ์เช่าทั้งหมด ({filteredLeasing.length} รายการ)
                </span>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {userRole === 'admin' && (
                    <button 
                      onClick={handleOpenAddLeasingModal}
                      style={{
                        backgroundColor: '#4f46e5',
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
                      เพิ่มอุปกรณ์เช่า
                    </button>
                  )}

                  <input 
                    type="text" 
                    placeholder="ค้นหา Asset No, ชื่ออุปกรณ์, Location..." 
                    value={leasingSearch}
                    onChange={(e) => setLeasingSearch(e.target.value)}
                    style={{ 
                      height: '36px',
                      width: '240px',
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      padding: '0 12px', 
                      fontSize: '13px',
                      fontWeight: 400,
                      color: '#0f172a',
                      backgroundColor: '#ffffff',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto', width: '100%' }}>
                {loadingLeasing ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>กำลังดึงข้อมูลอุปกรณ์เช่า...</div>
                ) : filteredLeasing.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 400 }}>ไม่พบข้อมูลอุปกรณ์เช่าตามเงื่อนไขการค้นหา</div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1200px', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ASSET NO</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ชื่ออุปกรณ์ (ASSET NAME)</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '90px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>TYPE</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', width: '160px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>ผู้ถือครองหลัก</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>เริ่มสัญญา</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>สิ้นสุดสัญญา</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', width: '150px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>สถานที่ตั้ง</th>
                        <th style={{ padding: '12px 20px 12px 12px', textAlign: 'center', width: '130px', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeasing.map((item, index) => {
                        const assetNo = item['Asset NO.'] || item.asset_no || '-'
                        const name = item['Asset Name'] || item.asset_name || '-'
                        const type = item['Type'] || item.type || '-'
                        const holder = item['ผู้ถือครอง 1'] || item.holder_1 || '-'
                        const purchase = item['Purchase'] || item.purchase || '-'
                        const endOf = item['End of'] || item.end_of || '-'
                        const location = item['Location'] || item.location || '-'

                        return (
                          <tr key={index} onClick={() => setSelectedLeasing(item)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '12px', color: '#0f172a', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                {assetNo}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 400, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {name}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '13px', fontWeight: 400, color: '#475569' }}>
                              {type}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: '13px', fontWeight: 400, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {holder}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '13px', fontWeight: 400, color: '#475569' }}>
                              {purchase}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center', fontSize: '13px', color: '#b91c1c', fontWeight: 500 }}>
                              {endOf}
                            </td>

                            <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: '13px', fontWeight: 400, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {location}
                            </td>

                            <td style={{ padding: '12px 20px 12px 12px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              {userRole === 'admin' ? (
                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                  <button onClick={() => handleOpenEditLeasingModal(item)} title="แก้ไข" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '0 8px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>แก้ไข</button>
                                  <button onClick={() => handleDeleteLeasing(item)} title="ลบ" style={{ backgroundColor: '#fff1f2', border: 'none', padding: '0 8px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400, color: '#e11d48' }}>ลบ</button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>สิทธิ์อ่านเท่านั้น (Read-only)</span>
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

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '600px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>⚙️ ตั้งค่าระบบและการส่งออกข้อมูล</span>
              <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Section: Export CSV Data */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', fontWeight: 600, fontSize: '13px', color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
                  📥 ส่งออกข้อมูล (Export CSV)
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#ffffff' }}>
                  <button
                    onClick={() => { exportHardwareToCSV(); setIsSettingsOpen(false); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', height: '36px', padding: '0 12px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f172a', fontWeight: 400 }}
                  >
                    <span>📦 ส่งออกข้อมูลฮาร์ดแวร์ (Hardware CSV)</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{allRawAssets.length} รายการ</span>
                  </button>
                  <button
                    onClick={() => { exportSoftwareToCSV(); setIsSettingsOpen(false); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', height: '36px', padding: '0 12px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f172a', fontWeight: 400 }}
                  >
                    <span>💻 ส่งออกข้อมูลซอฟต์แวร์ (Software CSV)</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{softwareList.length} รายการ</span>
                  </button>
                  <button
                    onClick={() => { exportLeasingToCSV(); setIsSettingsOpen(false); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', height: '36px', padding: '0 12px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f172a', fontWeight: 400 }}
                  >
                    <span>📋 ส่งออกข้อมูลอุปกรณ์เช่า (Leasing CSV)</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{leasingList.length} รายการ</span>
                  </button>
                </div>
              </div>

              {/* Section: Change Password */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(!isChangePasswordOpen)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: '#f8fafc',
                    border: 'none',
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#0f172a'
                  }}
                >
                  <span>🔑 เปลี่ยนรหัสผ่านประจำบัญชี (Change Password)</span>
                  <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>{isChangePasswordOpen ? '▲ ซ่อน' : '▼ เปิด'}</span>
                </button>

                {isChangePasswordOpen && (
                  <form onSubmit={handleChangePasswordSubmit} style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#ffffff' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, display: 'block', marginBottom: '4px' }}>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร) *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={changePasswordInput}
                        onChange={e => setChangePasswordInput(e.target.value)}
                        required
                        style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400, boxSizing: 'border-box', outline: 'none' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, display: 'block', marginBottom: '4px' }}>ยืนยันรหัสผ่านใหม่ *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={confirmPasswordInput}
                        onChange={e => setConfirmPasswordInput(e.target.value)}
                        required
                        style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400, boxSizing: 'border-box', outline: 'none' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangePasswordOpen(false)
                          setChangePasswordInput('')
                          setConfirmPasswordInput('')
                        }}
                        style={{ height: '32px', padding: '0 12px', backgroundColor: '#ffffff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        disabled={changingPassword}
                        style={{ height: '32px', padding: '0 14px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                      >
                        {changingPassword ? 'กำลังบันทึก...' : 'อัปเดตรหัสผ่าน'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section: Add User (Admin Only) */}
              {userRole === 'admin' && (
                <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setIsAddUserOpen(!isAddUserOpen)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: '#f8fafc',
                      border: 'none',
                      display: 'flex',
                      justify: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      color: '#0f172a'
                    }}
                  >
                    <span>➕ เพิ่มผู้ใช้งานใหม่ (สิทธิ์ Viewer)</span>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>{isAddUserOpen ? '▲ ซ่อน' : '▼ เปิด'}</span>
                  </button>

                  {isAddUserOpen && (
                    <form onSubmit={handleAddViewerUser} style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end', backgroundColor: '#ffffff' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, display: 'block', marginBottom: '4px' }}>Username หรือ อีเมล *</label>
                        <input type="text" placeholder="user หรือ user@company.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400, boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, display: 'block', marginBottom: '4px' }}>รหัสผ่าน (อย่างน้อย 6 ตัว) *</label>
                        <input type="password" placeholder="••••••••" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400, boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <button type="submit" disabled={addingUser} style={{ backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', padding: '0 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, height: '36px' }}>{addingUser ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                    </form>
                  )}
                </div>
              )}

            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <button 
                onClick={handleLogout} 
                style={{ 
                  height: '34px', 
                  padding: '0 16px', 
                  backgroundColor: '#fff1f2', 
                  color: '#e11d48', 
                  border: '1px solid #fecaca', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  fontSize: '12px', 
                  fontWeight: 500 
                }}
              >
                🚪 ออกจากระบบ
              </button>

              <button onClick={() => setIsSettingsOpen(false)} style={{ height: '34px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Return Hardware Modal */}
      {returningAsset && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setReturningAsset(null)}>
          <div className="modal-card" style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>ระบบคืนทรัพย์สินเข้าส่วนกลาง</span>
              <button onClick={() => setReturningAsset(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={executeReturnToStock}>
              <div style={{ padding: '20px' }}>
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{returningAsset.asset_name || 'อุปกรณ์ไอที'} ({returningAsset.asset_no || 'ไม่ระบุ Asset No'})</div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, marginTop: '2px' }}>ผู้ถือครองเดิม: <span>{getRealAssetHolder(returningAsset).realHolder}</span></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>แผนกที่รับเข้าจัดเก็บ *</label>
                    <select value={returnFormData.dept} onChange={(e) => setReturnFormData(prev => ({ ...prev, dept: e.target.value }))} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400 }} required>
                      <option value="แผนกสารสนเทศ">แผนกสารสนเทศ (IT)</option>
                      <option value="ส่วนกลาง">ส่วนกลางบริษัท</option>
                      {deptList.map((d, i) => <option key={i} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครองใหม่</label>
                    <input type="text" value={returnFormData.owner} onChange={(e) => setReturnFormData(prev => ({ ...prev, owner: e.target.value }))} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่จัดเก็บ/ตำแหน่งตั้ง</label>
                    <input type="text" value={returnFormData.location} onChange={(e) => setReturnFormData(prev => ({ ...prev, location: e.target.value }))} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>หมายเหตุเพิ่มเติม</label>
                    <textarea value={returnFormData.remark} onChange={(e) => setReturnFormData(prev => ({ ...prev, remark: e.target.value }))} rows="2" style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 400, resize: 'vertical' }}></textarea>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setReturningAsset(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ยกเลิก</button>
                <button type="submit" disabled={loadingHardware} style={{ height: '36px', padding: '0 16px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{loadingHardware ? 'กำลังดำเนินการ...' : 'บันทึกการคืนทรัพย์สิน'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form Hardware Modal */}
      {isFormOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{editingAsset ? 'แก้ไขข้อมูลฮาร์ดแวร์' : 'เพิ่มข้อมูลฮาร์ดแวร์'}</span>
              <button onClick={() => setIsFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เลขทรัพย์สิน (Asset No)</label>
                    <input type="text" value={formData.asset_no} onChange={e => setFormData({ ...formData, asset_no: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>หมวดหมู่ (Type) *</label>
                    <input type="text" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} required />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ชื่ออุปกรณ์ (Asset Name) *</label>
                    <input type="text" value={formData.asset_name} onChange={e => setFormData({ ...formData, asset_name: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} required />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ยี่ห้อ (Brand)</label>
                    <input type="text" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>แผนกสังกัด (Department)</label>
                    <input type="text" value={formData.dept} onChange={e => setFormData({ ...formData, dept: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครองหลัก</label>
                    <input type="text" value={formData.owner} onChange={e => setFormData({ ...formData, owner: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่ตั้ง / ตำแหน่ง</label>
                    <input type="text" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setIsFormOpen(false)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ยกเลิก</button>
                <button type="submit" disabled={submitting} style={{ height: '36px', padding: '0 16px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form Software Modal */}
      {isSoftwareFormOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsSoftwareFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{editingSoftware ? 'แก้ไขข้อมูลซอฟต์แวร์' : 'เพิ่มข้อมูลซอฟต์แวร์'}</span>
              <button onClick={() => setIsSoftwareFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleSoftwareFormSubmit}>
              <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ชื่อซอฟต์แวร์ (Software Name) *</label>
                    <input type="text" value={softwareFormData['Software name']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Software name': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} required />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เวอร์ชัน (Version)</label>
                    <input type="text" value={softwareFormData['Version']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Version': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ตำแหน่งติดตั้ง (Installed On)</label>
                    <input type="text" value={softwareFormData['Installed on']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Installed on': e.target.value })} placeholder="เช่น Server, Cloud, PC" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้จัดจำหน่าย (Vendor)</label>
                    <input type="text" value={softwareFormData['Vendor']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Vendor': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>จำนวนสิทธิ์ (No. of Licenses)</label>
                    <input type="number" value={softwareFormData['No. of License']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'No. of License': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>วันที่จัดซื้อ (Purchase Date)</label>
                    <input type="date" value={softwareFormData['Purchase date']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Purchase date': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>วันหมดอายุ / สถานะสัญญา</label>
                    <input type="text" value={softwareFormData['Expire Date']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Expire Date': e.target.value })} placeholder="เช่น 2026-12-31 หรือ Lifetime" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>รหัสทะเบียน / Asset NO</label>
                    <input type="text" value={softwareFormData['NO']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'NO': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เลขที่สัญญา (Contract No)</label>
                    <input type="text" value={softwareFormData['Contract Number']} onChange={e => setSoftwareFormData({ ...softwareFormData, 'Contract Number': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setIsSoftwareFormOpen(false)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ยกเลิก</button>
                <button type="submit" disabled={swSubmitting} style={{ height: '36px', padding: '0 16px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{swSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form Leasing Modal */}
      {isLeasingFormOpen && userRole === 'admin' && (
        <div className="modal-overlay" onClick={() => setIsLeasingFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{editingLeasing ? 'แก้ไขข้อมูลอุปกรณ์เช่า' : 'เพิ่มข้อมูลอุปกรณ์เช่า'}</span>
              <button onClick={() => setIsLeasingFormOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleLeasingFormSubmit}>
              <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>เลขทรัพย์สินเช่า (Asset NO.) *</label>
                    <input type="text" value={leasingFormData['Asset NO.']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Asset NO.': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} required />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ประเภทอุปกรณ์ (Type)</label>
                    <input type="text" value={leasingFormData['Type']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Type': e.target.value })} placeholder="เช่น AIO, PC, Notebook" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ชื่ออุปกรณ์ (Asset Name)</label>
                    <input type="text" value={leasingFormData['Asset Name']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Asset Name': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ยี่ห้อ (Brand)</label>
                    <input type="text" value={leasingFormData['Brand']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Brand': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>รุ่น (Model)</label>
                    <input type="text" value={leasingFormData['Model']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Model': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Serial Number</label>
                    <input type="text" value={leasingFormData['SerialNumber']} onChange={e => setLeasingFormData({ ...leasingFormData, 'SerialNumber': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>แผนก (Dept.)</label>
                    <input type="text" value={leasingFormData['Dept.']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Dept.': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>วันเริ่มเช่า (Purchase Date)</label>
                    <input type="text" value={leasingFormData['Purchase']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Purchase': e.target.value })} placeholder="เช่น 20/8/2025" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>วันสิ้นสุดสัญญา (End of)</label>
                    <input type="text" value={leasingFormData['End of']} onChange={e => setLeasingFormData({ ...leasingFormData, 'End of': e.target.value })} placeholder="เช่น 20/08/2028" style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครอง 1</label>
                    <input type="text" value={leasingFormData['ผู้ถือครอง 1']} onChange={e => setLeasingFormData({ ...leasingFormData, 'ผู้ถือครอง 1': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้ถือครอง 2</label>
                    <input type="text" value={leasingFormData['ผู้ถือครอง 2']} onChange={e => setLeasingFormData({ ...leasingFormData, 'ผู้ถือครอง 2': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>ผู้รับผิดชอบ</label>
                    <input type="text" value={leasingFormData['ผู้รับผิดชอบ']} onChange={e => setLeasingFormData({ ...leasingFormData, 'ผู้รับผิดชอบ': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>สถานที่ตั้ง (Location)</label>
                    <input type="text" value={leasingFormData['Location']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Location': e.target.value })} style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400 }} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#0f172a', fontWeight: 500, fontSize: '12px', display: 'block', marginBottom: '4px' }}>หมายเหตุ (Remark)</label>
                    <textarea value={leasingFormData['Remark']} onChange={e => setLeasingFormData({ ...leasingFormData, 'Remark': e.target.value })} rows="2" style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 400, resize: 'vertical' }}></textarea>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
                <button type="button" onClick={() => setIsLeasingFormOpen(false)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ยกเลิก</button>
                <button type="submit" disabled={leasingSubmitting} style={{ height: '36px', padding: '0 16px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{leasingSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hardware Details Modal */}
      {selectedAsset && (
        <div className="modal-overlay" onClick={() => setSelectedAsset(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>รายละเอียดทรัพย์สินฮาร์ดแวร์</span>
              <button onClick={() => setSelectedAsset(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {Object.entries(selectedAsset).map(([key, value], idx) => (
                  <div key={idx} style={{ gridColumn: String(value).length > 30 ? 'span 2' : 'span 1' }}>
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '11px', display: 'block', marginBottom: '2px' }}>{key}</span>
                    <span style={{ color: '#0f172a', fontWeight: 400, fontSize: '13px' }}>{value !== null && value !== '' ? String(value) : '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {userRole === 'admin' && (
                  <>
                    <button onClick={() => handleOpenEditModal(selectedAsset)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 400, backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>แก้ไข</button>
                    <button onClick={() => handleDeleteAsset(selectedAsset)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 400, backgroundColor: '#fff1f2', border: 'none', color: '#e11d48', borderRadius: '6px', cursor: 'pointer' }}>ลบ</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedAsset(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Software Details Modal */}
      {selectedSoftware && (
        <div className="modal-overlay" onClick={() => setSelectedSoftware(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>รายละเอียดลิขสิทธิ์ซอฟต์แวร์</span>
              <button onClick={() => setSelectedSoftware(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {Object.entries(selectedSoftware).map(([key, value], idx) => (
                  <div key={idx} style={{ gridColumn: String(value).length > 30 ? 'span 2' : 'span 1' }}>
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '11px', display: 'block', marginBottom: '2px' }}>{key}</span>
                    <span style={{ color: '#0f172a', fontWeight: 400, fontSize: '13px' }}>{value !== null && value !== '' ? String(value) : '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {userRole === 'admin' && (
                  <>
                    <button onClick={() => handleOpenEditSoftwareModal(selectedSoftware)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 400, backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>แก้ไข</button>
                    <button onClick={() => handleDeleteSoftware(selectedSoftware)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 400, backgroundColor: '#fff1f2', border: 'none', color: '#e11d48', borderRadius: '6px', cursor: 'pointer' }}>ลบ</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedSoftware(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Leasing Details Modal */}
      {selectedLeasing && (
        <div className="modal-overlay" onClick={() => setSelectedLeasing(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>รายละเอียดอุปกรณ์เช่า</span>
              <button onClick={() => setSelectedLeasing(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {Object.entries(selectedLeasing).map(([key, value], idx) => (
                  <div key={idx} style={{ gridColumn: String(value).length > 30 ? 'span 2' : 'span 1' }}>
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '11px', display: 'block', marginBottom: '2px' }}>{key}</span>
                    <span style={{ color: '#0f172a', fontWeight: 400, fontSize: '13px' }}>{value !== null && value !== '' ? String(value) : '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', padding: '12px 20px', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {userRole === 'admin' && (
                  <>
                    <button onClick={() => handleOpenEditLeasingModal(selectedLeasing)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 400, backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>แก้ไข</button>
                    <button onClick={() => handleDeleteLeasing(selectedLeasing)} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 400, backgroundColor: '#fff1f2', border: 'none', color: '#e11d48', borderRadius: '6px', cursor: 'pointer' }}>ลบ</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedLeasing(null)} style={{ height: '36px', padding: '0 16px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 400 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App