import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { ChatGroup, Message, User, Role } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { cn, formatPersonName } from '../../lib/utils';
import { Send, Users, Info, MoreVertical, Search, UserPlus, BookOpen, MessageSquare, ArrowLeft, Check, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface RecipientDetails {
  id: string;
  name: string;
  role: string;
  classId?: string;
  className?: string;
  schoolId?: string;
  schoolName?: string;
  email?: string;
}

interface ChatGroupWithMeta extends ChatGroup {
  recipient: RecipientDetails | null;
  lastMessage?: string;
  lastMessageTime?: string;
}

export default function InformativkaPage() {
  const { user, userSchoolRoles } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  
  // Core State
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'CHANNELS'>('PERSONAL');
  const [groups, setGroups] = useState<ChatGroupWithMeta[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Contacts / "New Chat" State
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<RecipientDetails[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Determine user context
  const isTeacher = user?.globalRole === Role.TEACHER || user?.globalRole === Role.SCHOOL_ADMIN || user?.globalRole === Role.ADMIN || user?.globalRole === Role.MAIN_ADMIN;
  const isParent = user?.globalRole === Role.PARENT;
  const isStudent = user?.globalRole === Role.STUDENT;

  const handleDeleteChat = async (chat: any) => {
    try {
      const chatId = chat.id;
      console.log("DELETE CHAT ID", chatId);

      if (!chatId) return;

      const { data: messages, error: fetchMessagesError } = await supabase
        .from("messages")
        .select("id")
        .eq("group_id", chatId);

      console.log("FETCH MESSAGES FOR DELETE", messages, fetchMessagesError);

      const messageIds = (messages || []).map((m: any) => m.id);

      if (messageIds.length > 0) {
        const { error: attachmentsError } = await supabase
          .from("message_attachments")
          .delete()
          .in("message_id", messageIds);

        console.log("DELETE ATTACHMENTS ERROR", attachmentsError);
      }

      const { error: messagesError } = await supabase
        .from("messages")
        .delete()
        .eq("group_id", chatId);

      console.log("DELETE MESSAGES ERROR", messagesError);

      const { error: membersError } = await supabase
        .from("chat_group_members")
        .delete()
        .eq("group_id", chatId);

      console.log("DELETE MEMBERS ERROR", membersError);

      const { error: groupError } = await supabase
        .from("chat_groups")
        .delete()
        .eq("id", chatId);

      console.log("DELETE GROUP ERROR", groupError);

      if (groupError || membersError || messagesError) {
        toast.error("Brisanje nije uspjelo.");
        return;
      }

      console.log("DELETE CHAT SUCCESS", chatId);

      setGroups(prev => prev.filter(g => g.id !== chatId));
      if (selectedGroup === chatId) {
        setSelectedGroup(null);
      }
      setRefreshTrigger(prev => prev + 1);
      console.log("DELETE FLOW FINISHED");
    } catch (err) {
      console.error("DELETE CHAT CRASH", err);
    }
  };

  // Sync Subject Channels
  useEffect(() => {
    if (!user || !selectedClassId) return;

    const syncChannels = async () => {
      const { data: classSubjects } = await supabase
        .from('class_subjects')
        .select('subject_id, subject:subjects(name)')
        .eq('class_id', selectedClassId);
      
      if (!classSubjects) return;

      for (const cs of classSubjects) {
        let channelId;
        const { data: existingChannel } = await supabase
          .from('chat_groups')
          .select('id')
          .eq('type', 'SUBJECT_CHANNEL')
          .eq('class_id', selectedClassId)
          .eq('subject_id', cs.subject_id)
          .maybeSingle();

        if (!existingChannel) {
          const subjectName = Array.isArray(cs.subject) ? (cs.subject[0] as any)?.name : (cs.subject as any)?.name;
          console.log("CREATING SUBJECT CHANNEL", subjectName);
          const { data: newChannel, error } = await supabase
            .from('chat_groups')
            .insert([{
              name: subjectName,
              type: 'SUBJECT_CHANNEL',
              class_id: selectedClassId,
              subject_id: cs.subject_id,
              created_by: user.id
            }])
            .select();
          
          if (newChannel) {
            console.log("CREATED SUBJECT CHANNEL", newChannel[0]);
            channelId = newChannel[0].id;
          }
        } else {
          channelId = existingChannel.id;
        }

        if (channelId) {
          // Sync members - students
          const { data: students } = await supabase.from('student_subject_enrollments').select('student_id').eq('subject_id', cs.subject_id);
          // Sync members - teachers
          const { data: teachers } = await supabase.from('class_subject_teachers').select('teacher_id').eq('class_id', selectedClassId).eq('subject_id', cs.subject_id);
          
          const members = [
            ...(students || []).map(s => ({ group_id: channelId, user_id: s.student_id })),
            ...(teachers || []).map(t => ({ group_id: channelId, user_id: t.teacher_id }))
          ];

          if (members.length > 0) {
            await supabase.from('chat_group_members').upsert(members, { onConflict: 'group_id,user_id' });
          }
        }
      }
    };
    syncChannels();
  }, [user, selectedClassId]);

  // 1. Fetch Chat Groups and resolve recipient profiles
  useEffect(() => {
    if (!user) return;

    const fetchGroupsAndRecipients = async () => {
      setLoading(true);
      try {
        // PERSONAL CHATS
        const { data: personalRaw, error: personalErr } = await supabase
          .from('chat_groups')
          .select(`
            *,
            chat_group_members!inner(user_id)
          `)
          .eq('chat_group_members.user_id', user.id)
          .in('type', ['PRIVATE', 'PRIVATE_GROUP']);
        
        if (personalErr) throw personalErr;
        const personalChats = personalRaw || [];

        // CHANNELS
        let channelsRaw: any[] = [];
        const { data: classData } = await supabase
          .from('classes')
          .select('homeroom_teacher_id, deputy_teacher_id')
          .eq('id', selectedClassId)
          .maybeSingle();

        const roles = [
          String(user.globalRole).toUpperCase(),
          ...(userSchoolRoles || []).map(r => String(r.role).toUpperCase())
        ];
        
        const canSeeAllClassChannels =
          roles.includes('ADMIN') ||
          roles.includes('SCHOOL_ADMIN') ||
          classData?.homeroom_teacher_id === user.id ||
          classData?.deputy_teacher_id === user.id;

        console.log("CAN SEE ALL CLASS CHANNELS", canSeeAllClassChannels);
        console.log("CHANNEL FETCH RESULT", channelsRaw);
        console.log("CURRENT CLASS", classData);
        console.log("CURRENT USER", user);

        if (canSeeAllClassChannels) {
           const { data: allChannels } = await supabase
             .from('chat_groups')
             .select('*')
             .eq('class_id', selectedClassId)
             .in('type', ['SUBJECT_CHANNEL', 'CUSTOM_CHANNEL', 'CLASS_CHANNEL']);
           channelsRaw = allChannels || [];
           console.log("CHANNEL FETCH RESULT", channelsRaw);
        } else if (roles.includes('TEACHER') || roles.includes('NASTAVNIK')) {
           const { data: teacherChannels } = await supabase
             .from('chat_groups')
             .select(`*, chat_group_members!inner(user_id)`)
             .eq('chat_group_members.user_id', user.id)
             .in('type', ['SUBJECT_CHANNEL', 'CUSTOM_CHANNEL', 'CLASS_CHANNEL']);
           channelsRaw = teacherChannels || [];
        } else if (roles.includes('STUDENT')) {
           const { data: enrollments } = await supabase
             .from('student_subject_enrollments')
             .select('subject_id')
             .eq('student_id', user.id)
             .eq('class_id', selectedClassId);
             
           const studentSubjectIds = enrollments?.map((e: any) => e.subject_id).filter(Boolean) || [];
           console.log("STUDENT SUBJECT IDS", studentSubjectIds);
           
           if (studentSubjectIds.length > 0) {
             const { data: enrolledChannels } = await supabase
               .from('chat_groups')
               .select('*')
               .eq('class_id', selectedClassId)
               .in('type', ['SUBJECT_CHANNEL', 'CUSTOM_CHANNEL', 'CLASS_CHANNEL'])
               .in('subject_id', studentSubjectIds);
             channelsRaw = enrolledChannels || [];
           } else {
             const { data: allSubjectChannels } = await supabase
               .from('chat_groups')
               .select('*')
               .eq('class_id', selectedClassId)
               .in('type', ['SUBJECT_CHANNEL', 'CUSTOM_CHANNEL', 'CLASS_CHANNEL']);
             channelsRaw = allSubjectChannels || [];
           }
        }

        console.log("FETCHED CHANNELS", channelsRaw);
        
        const activeGroupsMap = new Map();
        personalChats.forEach((g: any) => activeGroupsMap.set(g.id, g));
        channelsRaw.forEach(g => activeGroupsMap.set(g.id, g));
        const activeGroups = Array.from(activeGroupsMap.values()) as any[];
        
        console.log("PERSONAL CHATS", personalChats);
        console.log("CHANNELS", channelsRaw);
        console.log("VISIBLE CHANNELS", channelsRaw);

        if (activeGroups.length === 0) {
          setGroups([]);
          setLoading(false);
          return;
        }

        // Get all unique recipient IDs from groups (members other than current user)
        const recipientIds: string[] = [];
        
        // Fetch all members for these groups to find other participants
        const { data: allMembers, error: membersErr } = await supabase
          .from('chat_group_members')
          .select('group_id, user_id')
          .in('group_id', activeGroups.map(g => g.id));
        
        if (membersErr) throw membersErr;

        activeGroups.forEach(g => {
          const membersList = (allMembers || []).filter(m => m.group_id === g.id).map(m => m.user_id);
          membersList.forEach((mid: string) => {
            if (mid !== user.id && !recipientIds.includes(mid)) {
              recipientIds.push(mid);
            }
          });
        });

        // Fetch recipient profiles, classes, and schools
        const recipientMap = new Map<string, RecipientDetails>();

        if (recipientIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('*')
            .in('id', recipientIds);

          const fetchedProfiles = profiles || [];
          
          // Fetch class names for student recipients
          const classIds = [...new Set(fetchedProfiles.filter(p => p.role === 'STUDENT').map(p => p.class_id).filter(Boolean))];
          const classesMap = new Map<string, string>();
          if (classIds.length > 0) {
            const { data: classesData } = await supabase
              .from('classes')
              .select('id, name')
              .in('id', classIds);
            (classesData || []).forEach(c => classesMap.set(c.id, c.name));
          }

          // Fetch school names
          const schoolIds = [...new Set(fetchedProfiles.map(p => p.school_id).filter(Boolean))];
          const schoolsMap = new Map<string, string>();
          if (schoolIds.length > 0) {
            const { data: schoolsData } = await supabase
              .from('schools')
              .select('id, name')
              .in('id', schoolIds);
            (schoolsData || []).forEach(s => schoolsMap.set(s.id, s.name));
          }

          fetchedProfiles.forEach(p => {
            const matchedUser = mappers.user(p) as User;
            recipientMap.set(matchedUser.id, {
              id: matchedUser.id,
              name: formatPersonName(matchedUser),
              role: p.role,
              classId: p.class_id,
              className: p.class_id ? classesMap.get(p.class_id) : undefined,
              schoolId: p.school_id,
              schoolName: p.school_id ? schoolsMap.get(p.school_id) : undefined,
              email: p.email,
            });
          });
        }

        // Fetch last message for each group to show previews
        const lastMsgMap = new Map<string, { text: string; time: string }>();
        const groupIds = activeGroups.map(g => g.id);
        
        // This query fetches the latest message for each group
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('*')
          .in('group_id', groupIds)
          .order('timestamp', { ascending: false });

        if (lastMessages) {
          // Since it's ordered descending, the first insert per group key is the latest
          lastMessages.forEach(m => {
            if (!lastMsgMap.has(m.group_id)) {
              lastMsgMap.set(m.group_id, {
                text: m.text,
                time: m.timestamp,
              });
            }
          });
        }

        const groupsWithMeta: ChatGroupWithMeta[] = activeGroups.map(g => {
          // Find the recipient member
          const membersList = (allMembers || []).filter(m => m.group_id === g.id).map(m => m.user_id);
          const otherMemberId = membersList.find((mid: string) => mid !== user.id) || null;
          const recipient = otherMemberId ? recipientMap.get(otherMemberId) || null : null;
          const lastMsg = lastMsgMap.get(g.id);

          const isPersonal = g.type === 'PRIVATE' || g.type === 'PRIVATE_GROUP';

          return {
            id: g.id,
            name: (isPersonal && recipient) ? recipient.name : g.name,
            type: g.type,
            created_by: g.created_by,
            recipient: isPersonal ? recipient : null,
            lastMessage: lastMsg?.text,
            lastMessageTime: lastMsg?.time,
          };
        });

        // Sort by last message time descending or name
        groupsWithMeta.sort((a, b) => {
          if (a.lastMessageTime && b.lastMessageTime) {
            return b.lastMessageTime.localeCompare(a.lastMessageTime);
          }
          return a.name.localeCompare(b.name);
        });

        setGroups(groupsWithMeta);
        
        // Auto-select first group if none is selected
        if (groupsWithMeta.length > 0 && !selectedGroup) {
          setSelectedGroup(groupsWithMeta[0].id);
        }
      } catch (err) {
        console.error('Error loading Informativka groups:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroupsAndRecipients();

    // Set up polling for new messages every 8 seconds to deliver smooth feel
    const interval = setInterval(fetchGroupsAndRecipients, 8000);
    return () => clearInterval(interval);
  }, [user, selectedGroup, refreshTrigger]);

  // 2. Fetch Messages when group selection changes
  useEffect(() => {
    if (!selectedGroup) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', selectedGroup)
        .order('timestamp', { ascending: true }); // order ascending so they list chronologically down
      
      if (error) {
        console.error('Informativka Messages Error:', error);
      } else {
        setMessages((data || []).map(m => ({
          id: m.id,
          groupId: m.group_id,
          senderId: m.sender_id,
          text: m.text,
          timestamp: m.timestamp
        })));
        
        // Scroll to bottom immediately
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 80);
      }
    };

    fetchMessages();

    // Set up rapid polling for active chat messages (every 3 seconds)
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedGroup]);

  // Auto scroll to bottom when message list expands
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 3. Load Contacts for initiating a new chat
  const loadContacts = async () => {
    if (!user) return;
    setContactsLoading(true);
    setIsNewChatOpen(true);

    try {
      console.log("INFORMATIVKA FETCHING CONTACTS", { role: user.globalRole, classId: selectedClassId });
      const contacts: RecipientDetails[] = [];

      // Unified base profiles fetch
      const { data: allProfiles } = await supabase.from('user_profiles').select('*');
      const profiles = allProfiles || [];

      if (isTeacher) {
        // Teacher view: all students in class, plus other teachers
        const classStudents = profiles.filter(p => p.role === 'STUDENT' && p.class_id === selectedClassId);
        const otherTeachers = profiles.filter(p => p.role === 'NASTAVNIK' && p.id !== user.id);

        classStudents.forEach(p => {
          contacts.push({ id: p.id, name: formatPersonName(p as any), role: 'STUDENT', classId: p.class_id });
        });
        otherTeachers.forEach(p => {
          contacts.push({ id: p.id, name: formatPersonName(p as any), role: 'NASTAVNIK' });
        });
      } else {
        // Student view: classmates, subject teachers, homeroom
        // STUDENTS: role='STUDENT' and class_id=currentClassId
        const classmates = profiles.filter(p => p.role === 'STUDENT' && p.class_id === selectedClassId && p.id !== user.id);
        
        // Fetch teachers
        const { data: teachersData } = await supabase
          .from('class_subject_teachers')
          .select('teacher:user_profiles(*)')
          .eq('class_id', selectedClassId);

        const teacherProfiles = (teachersData || []).map(t => t.teacher as any).filter(Boolean);
        
        classmates.forEach(p => {
          contacts.push({ id: p.id, name: formatPersonName(p as any), role: 'STUDENT', classId: p.class_id });
        });
        teacherProfiles.forEach(p => {
          contacts.push({ id: p.id, name: formatPersonName(p), role: 'NASTAVNIK' });
        });
      }
      
      const uniqueContacts = Array.from(new Map(contacts.map(item => [item.id, item])).values());
      console.log("INFORMATIVKA USERS FETCHED", uniqueContacts);
      setAvailableContacts(uniqueContacts.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setContactsLoading(false);
    }
  };

  // 4. Start a new chat or open existing
  const handleStartChatWithRecipient = async (recipient: RecipientDetails) => {
    if (!user) return;
    console.log("SELECTED CHAT USER", recipient);

    try {
      // Check if chat group already exists with this recipient
      const existingGroup = groups.find(g => g.recipient?.id === recipient.id);

      if (existingGroup) {
        console.log("OPEN OR CREATE PRIVATE CHAT RESULT (existing)", existingGroup);
        setSelectedGroup(existingGroup.id);
        setIsNewChatOpen(false);
        return;
      }

      // Create a brand new chat group
      const newGroupRow = {
        name: recipient.name,
        type: 'PRIVATE',
        created_by: user.id,
      };

      const { data: newGroups, error: createError } = await supabase
        .from('chat_groups')
        .insert([newGroupRow])
        .select();

      if (createError) throw createError;
      
      const newGroupId = newGroups[0].id;
      
      // Add members to chat_group_members
      const { error: memberError } = await supabase
        .from('chat_group_members')
        .insert([
            { group_id: newGroupId, user_id: user.id },
            { group_id: newGroupId, user_id: recipient.id }
        ]);

      if (memberError) throw memberError;

      if (newGroups && newGroups.length > 0) {
        const createdGroupId = newGroups[0].id;
        console.log("OPEN OR CREATE PRIVATE CHAT RESULT (new)", newGroups[0]);
        console.log("ACTIVE CHAT", newGroups[0]);
        setSelectedGroup(createdGroupId);
        setIsNewChatOpen(false);
        
        // Force refresh groups list immediately
        const mappedNewGroup: ChatGroupWithMeta = {
          id: createdGroupId,
          name: recipient.name,
          type: 'PRIVATE',
          created_by: user.id,
          recipient: recipient,
        };
        setGroups(prev => [mappedNewGroup, ...prev]);
      }
    } catch (err) {
      console.error('Error starting chat:', err);
    }
  };

  // 5. Send a chat message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup || !user) return;

    const messageText = newMessage.trim();
    const payload = {
      group_id: selectedGroup,
      sender_id: user.id,
      content: messageText,
      text: messageText, // fallback
      timestamp: new Date().toISOString()
    };

    setNewMessage('');

    try {
      console.log("SEND MESSAGE PAYLOAD", payload);
      const { data, error } = await supabase
        .from('messages')
        .insert([payload])
        .select()
        .single();
      
      console.log("SEND MESSAGE RESULT", data, error);
      
      if (error) {
        console.error("SEND MESSAGE ERROR", error);
        toast.error("Greška pri slanju poruke.");
        throw error;
      }

      if (data) {
        setMessages(prev => [...prev, {
          id: data.id,
          groupId: data.group_id,
          senderId: data.sender_id,
          text: data.content || data.text,
          timestamp: data.timestamp
        }]);

        // Update the last message preview immediately in sidebar groups
        setGroups(prev => prev.map(g => {
          if (g.id === selectedGroup) {
            return {
              ...g,
              lastMessage: data.content || data.text,
              lastMessageTime: data.timestamp
            };
          }
          return g;
        }));
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const selectedActiveGroup = groups.find(g => g.id === selectedGroup);
  const activeRecipient = selectedActiveGroup?.recipient;

  // Search filter
  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    g.recipient?.className?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex h-full bg-[#f8fafc] overflow-hidden">
      
      {/* LEFT COLUMN: Sidebar with list of groups */}
      <div className={cn(
        "bg-white border-r border-gray-300 flex flex-col w-full md:w-80 shrink-0 shadow-xs",
        selectedGroup && "hidden md:flex" // Hide sidebar on small mobile displays if chat is open
      )}>
        <div className="p-4 border-b border-gray-200 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="text-[#005c8d]" size={18} />
              <h2 className="font-black text-gray-800 tracking-wide text-xs uppercase">Informativka</h2>
            </div>
            <button 
              onClick={loadContacts}
              className="p-1.5 bg-blue-50 text-[#005c8d] hover:bg-[#005c8d] hover:text-white transition-all rounded shadow-3xs cursor-pointer"
              title="Pokreni novi razgovor"
            >
              <UserPlus size={16} />
            </button>
          </div>
          <div className="flex p-0.5 bg-gray-100 rounded">
            <button 
              onClick={() => setActiveTab('PERSONAL')}
              className={cn("flex-1 flex items-center justify-center gap-2 py-1.5 text-[9px] font-black uppercase tracking-wide rounded transition-all", 
                activeTab === 'PERSONAL' ? "bg-white text-[#005c8d] shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Send size={10} /> Osobno
            </button>
            <button 
              onClick={() => setActiveTab('CHANNELS')}
              className={cn("flex-1 flex items-center justify-center gap-2 py-1.5 text-[9px] font-black uppercase tracking-wide rounded transition-all", 
                activeTab === 'CHANNELS' ? "bg-white text-[#005c8d] shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Users size={10} /> Kanali
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative flex items-center bg-gray-50 border border-gray-300 rounded px-2.5 py-1.5 focus-within:border-[#005c8d] focus-within:bg-white transition-all text-sm">
            <Search className="text-gray-400 shrink-0 mr-2" size={15} />
            <input
              type="text"
              placeholder="Pretraži razgovore..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none focus:ring-0 text-xs w-full text-slate-700"
            />
          </div>
        </div>

            {/* Conversations List */}
        <div className="flex-1 overflow-auto divide-y divide-gray-100">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-none">
              Učitavanje...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-8 text-center text-gray-400 italic text-xs">
              Nema aktivnih razgovora. Kliknite gumb (+) gore za pokretanje novog razgovora.
            </div>
          ) : (
            (() => {
              const personalChats = filteredGroups.filter(g => g.type === 'PRIVATE' || g.type === 'PRIVATE_GROUP');
              const channels = filteredGroups.filter(g => ['SUBJECT_CHANNEL', 'CUSTOM_CHANNEL', 'CLASS_CHANNEL'].includes(g.type));
              const displayGroups = activeTab === 'PERSONAL' ? personalChats : channels;
              
              console.log("ACTIVE TAB", activeTab);
              console.log("PERSONAL CHATS", personalChats);
              console.log("CHANNELS", channels);
              
              return displayGroups.map((g) => {
                const isActive = selectedGroup === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGroup(g.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 transition-all text-left group border-l-4 cursor-pointer",
                      isActive 
                        ? "bg-slate-50 border-[#005c8d] shadow-2xs" 
                        : "hover:bg-slate-50/50 border-transparent"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-[#005c8d] flex items-center justify-center shrink-0">
                      {activeTab === 'PERSONAL' ? <Users size={16} /> : <BookOpen size={16} />}
                    </div>
                    <div className="flex-1 overflow-hidden space-y-0.5">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-bold text-gray-900 text-xs truncate">
                          {g.name}
                        </span>
                        {g.lastMessageTime && (
                          <span className="text-[9px] text-gray-400 font-semibold shrink-0">
                            {new Date(g.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate italic">
                        {g.lastMessage ? g.lastMessage : 'Nema poruka.'}
                      </div>
                    </div>
                    {/* Delete button for private chats */}
                    {activeTab === 'PERSONAL' && (g.type === 'PRIVATE' || g.type === 'PRIVATE_GROUP') && (
                      <button
                        type="button"
                        title="Obriši razgovor"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("TRASH ICON CLICKED", g);
                          handleDeleteChat(g);
                        }}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors rounded shrink-0 z-10"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>

      {/* CENTER COLUMN: Real-Time Chat Engine */}
      <div className={cn(
        "flex-1 flex flex-col bg-slate-50 relative",
        !selectedGroup && "hidden md:flex" // Show on mobile only if a group is actually selected
      )}>
        {selectedGroup ? (
          <>
            {/* Active chat header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white shadow-xs">
              <div className="flex items-center gap-3">
                {/* Back button on mobile */}
                <button 
                  onClick={() => setSelectedGroup(null)}
                  className="md:hidden p-1.5 hover:bg-slate-100 rounded text-slate-700 border border-slate-200 mr-1"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <div className="font-black text-slate-900 text-xs uppercase tracking-wide">
                    {selectedActiveGroup?.name}
                  </div>
                  {activeRecipient && (
                    <div className="text-[10px] text-[#005c8d] font-bold uppercase tracking-wider mt-0.5 flex items-center gap-1">
                      <Shield size={10} /> {activeRecipient.role} {activeRecipient.className ? `• Razred: ${activeRecipient.className}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages body rendering */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-auto p-4 space-y-3.5 bg-slate-50"
            >
              {messages.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic text-xs">
                  Razgovor je otvoren. Napišite prvu poruku i pošaljite je.
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.senderId === user?.id;
                  
                  return (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "flex items-end gap-2.5 max-w-[80%]", 
                        isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      {!isMe && (
                        <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0 tracking-wider font-mono">
                          {selectedActiveGroup?.name?.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      
                      <div className="space-y-1">
                        <div className={cn(
                          "px-4 py-2.5 text-xs shadow-xs border relative",
                          isMe 
                            ? "bg-[#005c8d] text-white border-[#004a70] rounded-t-xl rounded-bl-xl" 
                            : "bg-white text-gray-800 border-gray-200 rounded-t-xl rounded-br-xl"
                        )}>
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {msg.text}
                          </div>
                        </div>
                        <div className={cn("text-[8px] font-bold uppercase text-gray-400 px-1 leading-none tracking-wider", isMe ? "text-right" : "text-left")}>
                          {new Date(msg.timestamp).toLocaleDateString('hr-HR')} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Form message submission */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-center gap-2 bg-slate-50 border border-gray-300 rounded focus-within:border-[#005c8d] focus-within:bg-white px-3 py-1.5 transition-all">
                <button 
                  type="button"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="p-1.5 text-gray-400 hover:text-[#005c8d] transition-all rounded cursor-pointer"
                  title="Priloži datoteku"
                >
                  <svg className="w-5 h-5 rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.586 6.586a6 6 0 108.486 8.486L18 13" />
                  </svg>
                </button>
                <input id="file-upload" type="file" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !selectedGroup || !user) return;
                  
                  try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Math.random()}.${fileExt}`;
                    const filePath = `chat_attachments/${fileName}`;
                    
                    const { error: uploadError } = await supabase.storage
                      .from('attachments')
                      .upload(filePath, file);
                      
                    if (uploadError) throw uploadError;
                    
                    const { data: { publicUrl } } = supabase.storage
                      .from('attachments')
                      .getPublicUrl(filePath);
                      
                    // Create message with attachment
                    const { data: msgData, error: msgError } = await supabase
                      .from('messages')
                      .insert({
                        group_id: selectedGroup,
                        sender_id: user.id,
                        content: `Prilog: ${file.name}`
                      })
                      .select()
                      .single();
                      
                    if (msgError) throw msgError;
                    
                    // Save attachment metadata
                    await supabase.from('message_attachments').insert({
                      message_id: msgData.id,
                      file_url: publicUrl,
                      file_name: file.name,
                      file_type: file.type,
                      file_size: file.size
                    });
                    
                    console.log("UPLOAD ATTACHMENT RESULT", "Success");
                    
                    // Refresh messages
                    setMessages(prev => [...prev, {
                      id: msgData.id,
                      groupId: msgData.group_id,
                      senderId: msgData.sender_id,
                      text: msgData.content,
                      timestamp: msgData.created_at
                    }]);
                    
                  } catch (err) {
                    console.error("UPLOAD ATTACHMENT ERROR", err);
                  }
                }} />
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Upišite Vašu poruku i pošaljite..."
                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-xs text-slate-700 py-1.5"
                />

                <button 
                  type="submit" 
                  disabled={!newMessage.trim()}
                  className="p-1.5 bg-[#005c8d] hover:bg-[#004a71] text-white transition-all disabled:opacity-30 disabled:pointer-events-none rounded cursor-pointer"
                >
                  <Send size={14} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mb-4 text-slate-300">
              <MessageSquare size={28} className="opacity-60" />
            </div>
            <h3 className="text-sm font-black uppercase text-gray-500 tracking-wider">Poruke i Informativka</h3>
            <p className="text-xs text-center text-gray-400 max-w-xs mt-1 leading-relaxed">
              Odaberite aktivni razgovor iz popisa s lijeve strane ili pritisnite ikonu za novi razgovor za pisanje nastavnicima ili učenicima.
            </p>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Chat details panel */}
      {selectedGroup && activeRecipient && (
        <div className="hidden xl:flex xl:w-72 bg-white border-l border-gray-200 flex-col shadow-xs shrink-0">
          <div className="p-4 border-b border-gray-200 font-bold text-gray-700 uppercase tracking-widest text-[9px]">
            Podaci o sugovorniku
          </div>
          
          <div className="p-6 flex flex-col items-center border-b border-gray-100">
            <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-3">
              <Users size={24} className="text-[#005c8d]" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 text-center leading-tight mb-1">
              {activeRecipient.name}
            </h3>
            <span className="bg-slate-50 text-slate-500 text-[8px] font-black uppercase tracking-widest border border-slate-200 px-2 py-0.5 rounded-full">
              {activeRecipient.role}
            </span>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="space-y-1.5">
              <span className="block text-[9px] font-black pointer-events-none uppercase text-slate-400 tracking-wider">Ustanova / Škola</span>
              <span className="font-semibold text-slate-700">{activeRecipient.schoolName || 'Opća škola e-Dnevnika'}</span>
            </div>

            {activeRecipient.className && (
              <div className="space-y-1.5">
                <span className="block text-[9px] font-black pointer-events-none uppercase text-slate-400 tracking-wider">Razredna skupina</span>
                <span className="font-semibold text-slate-700">{activeRecipient.className}</span>
              </div>
            )}

            {activeRecipient.email && (
              <div className="space-y-1.5">
                <span className="block text-[9px] font-black pointer-events-none uppercase text-slate-400 tracking-wider">E-adresa</span>
                <span className="font-medium text-slate-500 break-all select-all font-mono text-[10px]">{activeRecipient.email}</span>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex items-center gap-2 text-[9px] text-[#005c8d] font-bold uppercase">
              <Check size={12} strokeWidth={3} className="text-green-500" /> Sigurnosna veza aktivna
            </div>
          </div>
        </div>
      )}

      {/* NOVI RAZGOVOR / CONTACT SELECTOR MODAL */}
      {isNewChatOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white border border-gray-300 w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">Pokretanje razgovora</h3>
              <button 
                onClick={() => setIsNewChatOpen(false)}
                className="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase cursor-pointer"
              >
                Zatvori
              </button>
            </div>

            <div className="flex-1 overflow-auto divide-y divide-gray-100">
              {contactsLoading ? (
                <div className="text-center py-10 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  Učitavanje sugovornika...
                </div>
              ) : availableContacts.length === 0 ? (
                <div className="p-8 text-center text-gray-400 italic text-xs">
                  Nema dostupnih sugovornika za odabir.
                </div>
              ) : (
                availableContacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => handleStartChatWithRecipient(contact)}
                    className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[#005c8d] shrink-0 border border-slate-200">
                      <Users size={14} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-xs">
                        {contact.name}
                      </div>
                      <div className="text-[9px] text-gray-400 uppercase font-black tracking-wider mt-0.5">
                        {contact.role} {contact.className ? `• Razred: ${contact.className}` : ''}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
