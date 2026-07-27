'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Plus, Send, MessageSquare,
  Hash, Users, Circle, Lock, ChevronDown, ChevronRight,
  Search, X,
} from 'lucide-react'

interface ChatRoom {
  _id: string
  name: string
  type: 'CHANNEL' | 'DIRECT'
  description?: string
  members?: string[]
  createdAt?: string
}

interface ChatMessage {
  _id: string
  content: string
  senderId?: { name?: string; email?: string } | string
  senderName?: string
  roomId?: string
  createdAt: string
}

interface Employee {
  _id: string
  name: string
  email?: string
  role?: string
  department?: string
  isActive?: boolean
}

interface CurrentUser {
  id: string
  name: string
  email: string
}

function getSenderName(msg: ChatMessage): string {
  if (msg.senderName) return msg.senderName
  if (!msg.senderId) return 'Unknown'
  if (typeof msg.senderId === 'string') return msg.senderId
  return msg.senderId.name ?? msg.senderId.email ?? 'Unknown'
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function avatarColor(name: string) {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ]
  let hash = 0
  for (const c of name) hash = (hash + c.charCodeAt(0)) % colors.length
  return colors[hash]
}

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

const fmtDate = (d: string) => {
  const date = new Date(d)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function getDMDisplayName(room: ChatRoom, currentUserId: string, employees: Employee[]): string {
  // DM name is "dm:id1:id2" — extract the other user's ID
  const parts = room.name.replace('dm:', '').split(':')
  const otherId = parts.find(id => id !== currentUserId)
  const emp = employees.find(e => e._id === otherId)
  return emp?.name || emp?.email || 'Direct Message'
}

export default function ChatPage() {
  const router = useRouter()
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [showChannels, setShowChannels] = useState(true)
  const [showDMs, setShowDMs] = useState(true)
  const [showMembers, setShowMembers] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [startingDM, setStartingDM] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Current user
  const { data: meData } = useSWR('/api/auth/me')
  const currentUser: CurrentUser | null = meData?.success && meData.user
    ? { id: meData.user.id, name: meData.user.name || meData.user.email, email: meData.user.email }
    : null

  // Team members, with the same /api/employees -> /api/admin/users fallback
  // chain the original imperative fetchEmployees() used. The most common
  // failure on the primary route is "no active business selected" (both
  // routes require one), which used to just look like "chat has nobody to
  // DM" with zero indication why -- surfaced here via `employeesError`.
  const {
    data: employees = [],
    error: employeesFetchError,
  } = useSWR<Employee[]>('employees-for-chat', async () => {
    const res = await fetch('/api/employees?limit=100')
    if (res.ok) {
      const d = await res.json()
      const list = Array.isArray(d) ? d : (d.employees ?? d.data ?? [])
      return list.filter((e: Employee) => e.isActive !== false)
    }
    if (res.status === 400) {
      const d = await res.json().catch(() => ({}))
      if (String(d.error || '').toLowerCase().includes('businessid')) {
        throw new Error('Select a business (top of the sidebar) to see coworkers and start a DM or group.')
      }
    }
    const fallbackRes = await fetch('/api/admin/users?limit=100')
    if (fallbackRes.ok) {
      const d = await fallbackRes.json()
      return Array.isArray(d) ? d : (d.users ?? d.data ?? [])
    }
    return []
  })

  // Channels & DMs
  const {
    data: channelsRes,
    isLoading: loadingRooms,
    mutate: refetchChannels,
  } = useSWR('/api/chat/rooms?type=CHANNEL')
  const channels: ChatRoom[] = channelsRes?.success === false ? [] : (Array.isArray(channelsRes) ? channelsRes : (channelsRes?.rooms ?? []))

  const { data: dmsRes, mutate: refetchDms } = useSWR('/api/chat/rooms?type=DIRECT')
  const dms: ChatRoom[] = dmsRes?.success === false ? [] : (Array.isArray(dmsRes) ? dmsRes : (dmsRes?.rooms ?? []))

  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (employeesFetchError) setError(employeesFetchError.message || 'Failed to load team members')
  }, [employeesFetchError])

  useEffect(() => {
    if (channels.length > 0 && !selectedRoom) setSelectedRoom(channels[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  // Messages for the selected room, polling every 5s like the old
  // setInterval-based fetchMessages(roomId, true) did. `compare` mirrors the
  // old "silent" flicker guard -- treat same-length arrays as unchanged so a
  // poll tick with no new messages doesn't re-trigger the scroll-into-view
  // effect below.
  const {
    data: messagesRes,
    isLoading: loadingMessages,
    mutate: refetchMessages,
  } = useSWR(
    selectedRoom ? `/api/chat/messages?roomId=${selectedRoom._id}&limit=100` : null,
    { refreshInterval: 5000, compare: (a: any, b: any) => !!a && !!b && a.length === b.length }
  )
  const messages: ChatMessage[] = Array.isArray(messagesRes) ? messagesRes : (messagesRes?.messages ?? [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !selectedRoom) return
    setSending(true)
    const content = newMessage.trim()
    setNewMessage('')
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          roomId: selectedRoom._id,
          senderName: currentUser?.name || 'You',
        }),
      })
      if (res.ok) {
        const d = await res.json()
        const msg = d.message ?? d
        refetchMessages((prev: any) => {
          const list = Array.isArray(prev) ? prev : (prev?.messages ?? [])
          const nextList = [...list, msg]
          return Array.isArray(prev) ? nextList : { ...prev, messages: nextList }
        }, false)
      }
    } catch { /* silent */ }
    finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoomName.trim()) return
    setCreatingRoom(true)
    try {
      const res = await fetch('/api/chat/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoomName.trim() }),
      })
      if (res.ok) {
        const d = await res.json()
        const room = d.room ?? d
        refetchChannels((prev: any) => {
          const list = Array.isArray(prev) ? prev : (prev?.rooms ?? [])
          const nextList = [...list, room]
          return Array.isArray(prev) ? nextList : { ...prev, rooms: nextList }
        }, false)
        setSelectedRoom(room)
        setNewRoomName('')
        setShowNewRoom(false)
      } else {
        const e = await res.json()
        setError(e.error || 'Could not create channel')
      }
    } catch { /* silent */ }
    finally {
      setCreatingRoom(false)
    }
  }

  async function startDM(emp: Employee) {
    if (!currentUser) return
    setStartingDM(true)
    try {
      const res = await fetch('/api/chat/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withUserId: emp._id }),
      })
      if (res.ok) {
        const d = await res.json()
        const room: ChatRoom = { ...(d.room ?? d), type: 'DIRECT'}
        // Add to DM list if not present
        refetchDms((prev: any) => {
          const list: ChatRoom[] = Array.isArray(prev) ? prev : (prev?.rooms ?? [])
          if (list.find(r => r._id === room._id)) return prev
          const nextList = [...list, room]
          return Array.isArray(prev) ? nextList : { ...prev, rooms: nextList }
        }, false)
        setSelectedRoom(room)
        setShowDMs(true)
      }
    } catch {
      setError('Could not start DM')
    } finally {
      setStartingDM(false)
    }
  }

  const filteredEmployees = employees.filter(emp =>
    searchQuery
      ? (emp.name || emp.email || '').toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  const getRoomDisplayName = useCallback((room: ChatRoom) => {
    if (room.type === 'DIRECT' && currentUser) {
      return getDMDisplayName(room, currentUser.id, employees)
    }
    return room.name
  }, [currentUser, employees])

  // Group messages by date
  const grouped: { date: string; msgs: ChatMessage[] }[] = []
  for (const msg of messages) {
    const d = fmtDate(msg.createdAt)
    const last = grouped[grouped.length - 1]
    if (last && last.date === d) last.msgs.push(msg)
    else grouped.push({ date: d, msgs: [msg] })
  }

  return (
    <div className="h-screen bg-gray-50 text-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => router.push('/admin')}
          className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <MessageSquare className="w-5 h-5 text-gray-400" />
        <h1 className="text-lg font-semibold">Team Chat</h1>
        {selectedRoom && (
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
            {selectedRoom.type === 'DIRECT' ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Hash className="w-3.5 h-3.5" />
            )}
            <span className="font-medium text-gray-700">{getRoomDisplayName(selectedRoom)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">

          {/* Channels section */}
          <div>
            <button
              onClick={() => setShowChannels(p => !p)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition group"
            >
              <div className="flex items-center gap-1.5">
                {showChannels ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Channels</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowNewRoom(p => !p) }}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-200 transition opacity-0 group-hover:opacity-100"
              >
                <Plus className="w-3 h-3 text-gray-500" />
              </button>
            </button>

            {showNewRoom && (
              <form onSubmit={createChannel} className="px-3 py-2 border-b border-gray-100">
                <input
                  autoFocus
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="channel-name"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400 mb-1.5"
                />
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setShowNewRoom(false); setNewRoomName('') }}
                    className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={creatingRoom || !newRoomName.trim()}
                    className="flex-1 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-50 hover:bg-gray-800 transition">
                    {creatingRoom ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Create'}
                  </button>
                </div>
              </form>
            )}

            {showChannels && (
              <div className="pb-1">
                {loadingRooms ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                ) : channels.length === 0 ? (
                  <p className="text-xs text-gray-400 px-4 py-2">No channels yet</p>
                ) : (
                  channels.map(room => (
                    <button
                      key={room._id}
                      onClick={() => setSelectedRoom(room)}
                      className={`w-full text-left px-4 py-1.5 flex items-center gap-2 transition rounded-none ${
                        selectedRoom?._id === room._id
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                      <span className="text-sm truncate">{room.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* DMs section */}
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowDMs(p => !p)}
              className="w-full flex items-center gap-1.5 px-4 py-2.5 hover:bg-gray-50 transition"
            >
              {showDMs ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Direct Messages</span>
              {dms.length > 0 && (
                <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">{dms.length}</span>
              )}
            </button>

            {showDMs && (
              <div className="pb-1">
                {dms.length === 0 ? (
                  <p className="text-xs text-gray-400 px-4 py-2">No DMs yet. Click a team member to start.</p>
                ) : (
                  dms.map(room => {
                    const name = currentUser ? getDMDisplayName(room, currentUser.id, employees) : 'DM'
                    return (
                      <button
                        key={room._id}
                        onClick={() => setSelectedRoom(room)}
                        className={`w-full text-left px-4 py-1.5 flex items-center gap-2 transition ${
                          selectedRoom?._id === room._id
                            ? 'bg-gray-100 text-gray-900 font-medium'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${avatarColor(name)}`}>
                          {initials(name)}
                        </div>
                        <span className="text-sm truncate">{name}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Team Members */}
          <div className="border-t border-gray-100 flex-1 flex flex-col overflow-hidden mt-1">
            <button
              onClick={() => setShowMembers(p => !p)}
              className="w-full flex items-center gap-1.5 px-4 py-2.5 hover:bg-gray-50 transition flex-shrink-0"
            >
              {showMembers ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
              <Users className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Team</span>
              <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">{employees.length}</span>
            </button>

            {showMembers && (
              <>
                {/* Search */}
                <div className="px-3 pb-2 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search members..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 pb-3 space-y-0.5">
                  {filteredEmployees.length === 0 ? (
                    <p className="text-xs text-gray-400 px-4 py-2">No members found.</p>
                  ) : filteredEmployees.map(emp => {
                    const name = emp.name || emp.email || '?'
                    const isMe = emp._id === currentUser?.id
                    return (
                      <div
                        key={emp._id}
                        className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 transition group cursor-default"
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                          isMe ? 'bg-gray-900 text-white' : avatarColor(name)
                        }`}>
                          {initials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-700 truncate font-medium">
                            {name}
                            {isMe && <span className="text-gray-400 font-normal"> (you)</span>}
                          </p>
                          {emp.department && (
                            <p className="text-[10px] text-gray-400 truncate">{emp.department}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Circle className="w-1.5 h-1.5 text-emerald-500 fill-emerald-500 flex-shrink-0" />
                          {!isMe && (
                            <button
                              onClick={() => startDM(emp)}
                              disabled={startingDM}
                              title="Send DM"
                              className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-200 transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                            >
                              {startingDM ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" /> : <MessageSquare className="w-3 h-3 text-gray-500" />}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {!selectedRoom ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Select a channel or start a DM</p>
                <p className="text-gray-400 text-sm mt-1">Click a team member to message them privately</p>
              </div>
            </div>
          ) : (
            <>
              {/* Room header */}
              <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
                {selectedRoom.type === 'DIRECT' ? (
                  <>
                    <Lock className="w-4 h-4 text-gray-400" />
                    <span className="font-semibold text-gray-900">{getRoomDisplayName(selectedRoom)}</span>
                    <span className="text-xs text-gray-400 ml-1">— Private Message</span>
                  </>
                ) : (
                  <>
                    <Hash className="w-4 h-4 text-gray-400" />
                    <span className="font-semibold text-gray-900">{selectedRoom.name}</span>
                    {selectedRoom.description && (
                      <span className="text-xs text-gray-400 ml-1">— {selectedRoom.description}</span>
                    )}
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    {selectedRoom.type === 'DIRECT' ? (
                      <>
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold mb-4 ${avatarColor(getRoomDisplayName(selectedRoom))}`}>
                          {initials(getRoomDisplayName(selectedRoom))}
                        </div>
                        <p className="text-gray-700 font-medium">This is the beginning of your conversation with {getRoomDisplayName(selectedRoom)}</p>
                        <p className="text-gray-400 text-sm mt-1">Messages are private between you two.</p>
                      </>
                    ) : (
                      <>
                        <Hash className="w-10 h-10 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">Welcome to #{selectedRoom.name}!</p>
                        <p className="text-gray-400 text-sm mt-1">This is the start of the channel. Send a message to begin.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grouped.map(({ date, msgs }) => (
                      <div key={date}>
                        {/* Date divider */}
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 border-t border-gray-200" />
                          <span className="text-xs text-gray-400 bg-gray-50 px-2">{date}</span>
                          <div className="flex-1 border-t border-gray-200" />
                        </div>
                        <div className="space-y-3">
                          {msgs.map((msg, i) => {
                            const prevMsg = i > 0 ? msgs[i - 1] : null
                            const senderName = getSenderName(msg)
                            const prevSender = prevMsg ? getSenderName(prevMsg) : null
                            const isGrouped = prevSender === senderName
                            const isMe = msg.senderId === currentUser?.id || (typeof msg.senderId === 'object' && false)

                            return (
                              <div key={msg._id} className={`flex gap-3 ${isGrouped ? 'mt-0.5' : 'mt-3'}`}>
                                {!isGrouped ? (
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                                    isMe ? 'bg-gray-900 text-white' : avatarColor(senderName)
                                  }`}>
                                    {initials(senderName)}
                                  </div>
                                ) : (
                                  <div className="w-8 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  {!isGrouped && (
                                    <div className="flex items-baseline gap-2 mb-0.5">
                                      <span className="text-sm font-semibold text-gray-900">{senderName}</span>
                                      <span className="text-xs text-gray-400">{fmtTime(msg.createdAt)}</span>
                                    </div>
                                  )}
                                  <p className="text-sm text-gray-700 leading-relaxed break-words">{msg.content}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Message input */}
              <form
                onSubmit={sendMessage}
                className="px-6 py-4 border-t border-gray-200 bg-white flex items-center gap-3"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder={
                    selectedRoom.type === 'DIRECT'
                      ? `Message ${getRoomDisplayName(selectedRoom)}`
                      : `Message #${selectedRoom.name}`
                  }
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:bg-white transition"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition disabled:opacity-40"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 z-50 shadow-sm">
          {error}
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
