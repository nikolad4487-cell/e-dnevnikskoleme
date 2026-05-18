const fs = require('fs');

let file = 'src/pages/teacher/DnevnikRadaPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldHandleCreateWeek = `const handleCreateWeek = async () => {
    if (!effectiveClassId) return;
    try {
      const studentCount = students.length || 1;
      const startIdx = (weeks.length * 2) % studentCount;
      const onDuty = Array.from(new Set([
        students[startIdx]?.id || '',
        students[(startIdx + 1) % studentCount]?.id || ''
      ])).filter(id => id !== '');

      const days: string[] = [];
      let current = new Date(newWeek.startDate);
      const end = new Date(newWeek.endDate);
      while(current <= end) {
        const dayOfWeek = current.getDay();
        if (newWeek.dailyTeachingStatus[dayOfWeek]) {
          days.push(current.toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
      }

      const { data, error } = await supabase
        .from('work_weeks')
        .insert({
          class_id: effectiveClassId,
          school_id: selectedSchoolId,
          name: newWeek.name,
          start_date: newWeek.startDate,
          end_date: newWeek.endDate,
          on_duty_student_ids: onDuty,
          teaching_days: days,
          shift: newWeek.shift,
          is_teaching_week: newWeek.isTeachingWeek
        })
        .select()
        .single();
        
      if (error) throw error;

      setWeeks([...weeks, mappers.week(data)]);
      setShowWeekModal(false);
      setNewWeek({ 
        name: '', 
        startDate: '', 
        endDate: '', 
        teachingDays: [], 
        shift: 'Ujutro', 
        isTeachingWeek: true,
        dailyTeachingStatus: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false }
      });
    } catch (err) {
      console.error(err);
      toast.error('Greška pri kreiranju tjedna');
    }
  };`;

const newHandleCreateWeek = `const handleCreateWeek = async () => {
    if (!effectiveClassId) return;
    
    // Ensure we are using current class context correctly
    const currentClass = classes.find(c => c.id === effectiveClassId);
    if (!currentClass) {
        toast.error('Razred nije pronađen');
        return;
    }

    try {
      const studentCount = students.length || 1;
      const startIdx = (weeks.length * 2) % studentCount;
      const onDuty = Array.from(new Set([
        students[startIdx]?.id || '',
        students[(startIdx + 1) % studentCount]?.id || ''
      ])).filter(id => id !== '');

      const days: string[] = [];
      let current = new Date(newWeek.startDate);
      const end = new Date(newWeek.endDate);
      while(current <= end) {
        const dayOfWeek = current.getDay();
        if (newWeek.dailyTeachingStatus[dayOfWeek]) {
          days.push(current.toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
      }

      const payload = {
          class_id: effectiveClassId,
          school_year_id: currentClass.schoolYearId, // Ensure we use school_year_id
          school_year: currentClass.schoolYear,
          school_id: selectedSchoolId,
          name: newWeek.name,
          start_date: newWeek.startDate,
          end_date: newWeek.endDate,
          on_duty_student_ids: onDuty,
          teaching_days: days,
          shift: newWeek.shift,
          is_teaching_week: newWeek.isTeachingWeek
      };
      
      console.log("WORK WEEK INSERT PAYLOAD:", payload);

      const { data, error } = await supabase
        .from('work_weeks')
        .insert(payload)
        .select()
        .single();
        
      console.log("WORK WEEK INSERT ERROR:", error);

      if (error) {
        toast.error('Greška pri kreiranju radnog tjedna: ' + error.message);
        throw error;
      }

      setWeeks([...weeks, mappers.week(data)]);
      setShowWeekModal(false);
      setNewWeek({ 
        name: '', 
        startDate: '', 
        endDate: '', 
        teachingDays: [], 
        shift: 'Ujutro', 
        isTeachingWeek: true,
        dailyTeachingStatus: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false }
      });
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri kreiranju radnog tjedna: ' + err.message);
    }
  };`;

content = content.replace(oldHandleCreateWeek, newHandleCreateWeek);
fs.writeFileSync(file, content);
console.log('Updated WorkWeeks HandleCreateWeek with logging');
