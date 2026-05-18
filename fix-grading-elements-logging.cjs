const fs = require('fs');

let file = 'src/pages/teacher/ImenikPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldHandleAdd = `const handleAdd = async () => {
    if (!newElementName.trim()) return;
    try {
      const { error } = await supabase.from('grading_elements').insert([{
        school_id: schoolId,
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subject.id,
        name: newElementName.trim(),
        description: newElementDesc.trim() || null,
        display_order: elements.length
      }]);
      if (error) throw error;
      setNewElementName('');
      setNewElementDesc('');
      fetchElements();
      onRefresh();
    } catch (err) {
      toast.error('Greška pri dodavanju elementa.');
    }
  };`;

const newHandleAdd = `const handleAdd = async () => {
    if (!newElementName.trim()) return;
    
    const payload = {
      school_id: schoolId,
      class_id: classId,
      subject_id: subject.id,
      teacher_id: teacherId,
      name: newElementName.trim(),
      description: newElementDesc.trim() || null,
      display_order: elements.length
    };
    
    console.log("GRADING ELEMENT INSERT PAYLOAD:", payload);

    try {
      const { data, error } = await supabase
        .from("grading_elements")
        .insert([payload])
        .select()
        .single();
        
      console.log("GRADING ELEMENT INSERT RESULT:", data);
      console.log("GRADING ELEMENT INSERT ERROR:", error);

      if (error) {
        toast.error("Greška pri dodavanju elementa: " + error.message);
        return;
      }

      setNewElementName('');
      setNewElementDesc('');
      fetchElements();
      onRefresh();
    } catch (err: any) {
      toast.error('Greška pri dodavanju elementa.');
    }
  };`;

content = content.replace(oldHandleAdd, newHandleAdd);
fs.writeFileSync(file, content);
console.log('Updated Grading Elements HandleAdd with logging');
