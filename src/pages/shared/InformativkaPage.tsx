import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ChatGroup, Message } from '../../types';
import { cn } from '../../lib/utils';
import { Send, Hash, Users, Info, MoreVertical, Paperclip, Smile, Search } from 'lucide-react';

export default function InformativkaPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    
    // Fetch user's groups
    const fetchGroups = async () => {
      const { data, error } = await supabase
        .from('chat_groups')
        .select('*')
        .contains('members', [user.id]);
      
      if (error) {
        console.error('Informativka Groups Error:', error);
      } else {
        setGroups(data || []);
        if (data && data.length > 0 && !selectedGroup) setSelectedGroup(data[0].id);
      }
      setLoading(false);
    };

    fetchGroups();

    // Listen for group changes
    const channel = supabase
      .channel('chat_groups_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'chat_groups',
        filter: `members=cs.{${user.id}}`
      }, fetchGroups)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!selectedGroup) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', selectedGroup)
        .order('timestamp', { ascending: false });
      
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
      }
    };

    fetchMessages();

    // Real-time messages
    const channel = supabase
      .channel(`group_messages_${selectedGroup}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `group_id=eq.${selectedGroup}`
      }, (payload) => {
        const newMsg = payload.new as any;
        setMessages(prev => [{
          id: newMsg.id,
          groupId: newMsg.group_id,
          senderId: newMsg.sender_id,
          text: newMsg.text,
          timestamp: newMsg.timestamp
        }, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroup]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup || !user) return;

    try {
      const { error } = await supabase.from('messages').insert([{
        group_id: selectedGroup,
        sender_id: user.id,
        text: newMessage,
        timestamp: new Date().toISOString(),
      }]);
      
      if (error) throw error;
      setNewMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  const group = groups.find(g => g.id === selectedGroup);

  return (
    <div className="flex h-full bg-[#f3f4f6]">
      {/* LEFT: Groups List */}
      <div className="w-20 md:w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="hidden md:block font-bold text-gray-800">Informativka</h2>
          <button className="p-2 hover:bg-gray-100 rounded">
            <Search size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 transition-colors text-left",
                selectedGroup === g.id ? "bg-[#005c8d]/10 border-r-4 border-[#005c8d]" : "hover:bg-gray-50 border-r-4 border-transparent"
              )}
            >
              <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center shrink-0 text-[#005c8d]">
                {g.type === 'CLASS' ? <Users size={24} /> : <Hash size={24} />}
              </div>
              <div className="hidden md:block flex-1 overflow-hidden">
                <div className="font-bold text-sm truncate">{g.name}</div>
                <div className="text-xs text-gray-400 truncate uppercase mt-0.5">{g.type}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CENTER: Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedGroup ? (
          <>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="font-bold text-gray-800">{group?.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 text-gray-400 hover:text-gray-600"><Info size={20} /></button>
                <button className="p-2 text-gray-400 hover:text-gray-600 lg:hidden"><MoreVertical size={20} /></button>
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50/30"
            >
              {messages.map((msg, i) => {
                const isMe = msg.senderId === user?.id;
                const showAvatar = i === 0 || messages[i-1].senderId !== msg.senderId;
                
                return (
                  <div key={msg.id} className={cn("flex items-start gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                    {!isMe && (
                      <div className="w-8 h-8 rounded bg-[#005c8d] text-white flex items-center justify-center text-[10px] uppercase font-bold shrink-0">
                        {msg.senderId.slice(0, 2)}
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[70%] px-4 py-2 rounded-lg text-sm shadow-sm",
                      isMe ? "bg-[#005c8d] text-white" : "bg-white border border-gray-200 text-gray-800"
                    )}>
                      {msg.text}
                      <div className={cn("text-[9px] mt-1 opacity-60", isMe ? "text-right" : "text-left")}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1">
                <button type="button" className="p-2 text-gray-400 hover:text-gray-600"><Paperclip size={20} /></button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Napišite poruku..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
                />
                <button type="button" className="p-2 text-gray-400 hover:text-gray-600"><Smile size={20} /></button>
                <button 
                  type="submit" 
                  disabled={!newMessage.trim()}
                  className="p-2 text-[#005c8d] disabled:opacity-30 disabled:grayscale transition-all hover:scale-110 active:scale-95"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
              <Send size={48} className="opacity-20" />
            </div>
            <h3 className="text-xl font-bold text-gray-500 mb-2">Vaše poruke</h3>
            <p className="text-sm text-center max-w-xs">Tražite grupu, roditelja ili kolegu i započnite razgovor.</p>
          </div>
        )}
      </div>

      {/* RIGHT: Group Info (Desktop only) */}
      <div className="hidden xl:w-80 bg-white border-l border-gray-200 flex flex-col shadow-sm">
        <div className="p-4 border-b border-gray-200 font-bold text-gray-800 uppercase tracking-wider text-xs">
          Podaci o grupi
        </div>
        <div className="p-6 flex flex-col items-center">
          <div className="w-24 h-24 rounded bg-gray-100 flex items-center justify-center mb-4 text-[#005c8d]">
            {group?.type === 'CLASS' ? <Users size={48} /> : <Hash size={48} />}
          </div>
          <h3 className="text-lg font-bold text-gray-800 text-center mb-1">{group?.name}</h3>
          <p className="text-xs text-gray-400 uppercase font-semibold">{group?.type} GRUPA</p>
          
          <div className="w-full mt-10 space-y-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase border-b border-gray-100 pb-2">Članovi grupe</div>
            {/* Mock members */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gray-200 border border-white"></div>
              <div className="text-sm border-b border-gray-50 flex-1 py-1">Svi učenici razreda</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gray-200 border border-white"></div>
              <div className="text-sm border-b border-gray-50 flex-1 py-1">Razrednik</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
