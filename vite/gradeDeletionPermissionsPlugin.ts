import type { Plugin } from 'vite';

const TARGET = '/src/pages/teacher/ImenikPage.tsx';

function replaceRequired(code: string, from: string, to: string, label: string): string {
  if (!code.includes(from)) {
    throw new Error(`[grade-deletion-permissions] ${label} nije pronađen.`);
  }
  return code.replace(from, to);
}

function replaceBetween(
  code: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
  label: string
): string {
  const start = code.indexOf(startMarker);
  const end = code.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`[grade-deletion-permissions] ${label} nije pronađen.`);
  }
  return code.slice(0, start) + replacement + code.slice(end);
}

const ADMIN_PERMISSION_BLOCK = `  const canAdminDeleteGrades = useMemo(() => {
    const highest = String(highestRole || '').toUpperCase();
    if (
      isMainAdmin ||
      highest === Role.MAIN_ADMIN ||
      highest === Role.ADMIN ||
      highest === Role.SCHOOL_ADMIN
    ) {
      return true;
    }

    return (userSchoolRoles || []).some((entry: any) => {
      const role = String(entry.role || '').toUpperCase();
      const status = String(entry.status || 'ACTIVE').toUpperCase();
      const roleSchoolId = entry.schoolId || entry.school_id;
      const isAdminRole =
        role === Role.MAIN_ADMIN ||
        role === Role.ADMIN ||
        role === Role.SCHOOL_ADMIN;

      return (
        status === 'ACTIVE' &&
        isAdminRole &&
        (role === Role.MAIN_ADMIN || !selectedSchoolId || !roleSchoolId || roleSchoolId === selectedSchoolId)
      );
    });
  }, [isMainAdmin, highestRole, userSchoolRoles, selectedSchoolId]);`;

const NEW_DELETE_HANDLER = `  const handleDeleteGrade = async (gradeId: string, adminOverride = false) => {
    const grade = currentGrades.find(g => g.id === gradeId);
    if (!grade) return;

    const rawCreatedAt = (grade as any).createdAt || (grade as any).created_at;
    const createdAt = rawCreatedAt ? new Date(rawCreatedAt) : null;
    const hasValidCreatedAt = Boolean(createdAt && !Number.isNaN(createdAt.getTime()));
    const diffMinutes = hasValidCreatedAt
      ? Math.max(0, (Date.now() - createdAt!.getTime()) / 60000)
      : Number.POSITIVE_INFINITY;

    const gradeTeacherId = (grade as any).teacherId || (grade as any).teacher_id;
    const isCreator = gradeTeacherId === user?.id;

    if (diffMinutes <= 45 && !isCreator && !canAdminDeleteGrades) {
      toast.error('Ocjenu unutar 45 minuta može obrisati samo nastavnik koji ju je upisao ili administrator. Ostali nastavnici mogu uređivati samo bilješku.');
      return;
    }

    if (diffMinutes > 45 && !canAdminDeleteGrades) {
      toast.error('Nakon 45 minuta ocjenu može obrisati samo administrator uz kod iz autentifikatora. Nastavnici mogu uređivati samo bilješku.');
      return;
    }

    if (diffMinutes > 45 && canAdminDeleteGrades && !adminOverride) {
      setSelectedGrade(grade);
      setDeleteConfirmationCode('');
      setShowAdminDeleteAuth(true);
      return;
    }

    if (diffMinutes > 45 && adminOverride && !/^\\d{6}$/.test(deleteConfirmationCode.trim())) {
      toast.error('Unesite 6-znamenkasti kod iz autentifikatora.');
      return;
    }

    setDeleteDialog({
      isOpen: true,
      id: gradeId,
      type: 'GRADE',
      loading: false,
      message: diffMinutes > 45
        ? 'Potvrdite brisanje ocjene starije od 45 minuta.'
        : 'Jeste li sigurni da želite obrisati ovu ocjenu?'
    });
  };`;

const GRADE_DELETE_CONFIRM_BLOCK = `
    if (deleteDialog.type === 'GRADE') {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          throw new Error('Aktivna korisnička sesija nije pronađena.');
        }

        const response = await fetch('/api/grades/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + accessToken,
            Accept: 'application/json',
          },
          body: JSON.stringify({
            gradeId: deleteDialog.id,
            authenticatorCode: deleteConfirmationCode.trim() || null,
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('API za brisanje ocjene nije vratio JSON odgovor.');
        }

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'Brisanje ocjene nije uspjelo.');
        }

        toast.success('Ocjena je uspješno obrisana.');
        setSelectedGrade(null);
        setShowAdminDeleteAuth(false);
        setDeleteConfirmationCode('');
        await fetchGradesAndNotes();
        await fetchStudentsData();
        await fetchWarningData();
      } catch (err: any) {
        console.error('GRADE DELETE API ERROR:', err);
        toast.error(err?.message || 'Brisanje ocjene nije uspjelo.');
      } finally {
        setDeleteDialog({ isOpen: false, id: '', type: null, loading: false });
      }
      return;
    }
`;

const OLD_HISTORY_ACTIONS = `                          {item.type === 'GRADE' ? (
                            <button 
                              onClick={() => handleDeleteGrade(item.id)} 
                              className="text-slate-300 hover:text-red-500 p-1"
                              title="Obriši ocjenu"
                            >
                              <Trash2 size={12}/>
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleDeleteNote(item.id)} 
                              className="text-slate-300 hover:text-red-500 p-1"
                              title="Obriši bilješku"
                            >
                              <Trash2 size={12}/>
                            </button>
                          )}`;

const NEW_HISTORY_ACTIONS = `                          {item.type === 'GRADE' ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setSelectedGrade(item.raw);
                                  setGradeEditForm({ note: item.raw.note || '' });
                                  setIsEditingGrade(true);
                                }}
                                className="text-slate-300 hover:text-[#005c8d] p-1"
                                title="Uredi bilješku uz ocjenu"
                              >
                                <Edit2 size={12}/>
                              </button>
                              {(() => {
                                const rawCreatedAt = item.raw.createdAt || item.raw.created_at;
                                const createdAt = rawCreatedAt ? new Date(rawCreatedAt) : null;
                                const within45Minutes = Boolean(
                                  createdAt &&
                                  !Number.isNaN(createdAt.getTime()) &&
                                  (Date.now() - createdAt.getTime()) / 60000 <= 45
                                );
                                const gradeTeacherId = item.raw.teacherId || item.raw.teacher_id;
                                const isCreator = gradeTeacherId === user?.id;
                                const mayDelete = canAdminDeleteGrades || (within45Minutes && isCreator);

                                return mayDelete ? (
                                  <button
                                    onClick={() => handleDeleteGrade(item.id)}
                                    className="text-slate-300 hover:text-red-500 p-1"
                                    title={within45Minutes ? 'Obriši ocjenu' : 'Obriši ocjenu uz administratorsku autorizaciju'}
                                  >
                                    <Trash2 size={12}/>
                                  </button>
                                ) : null;
                              })()}
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleDeleteNote(item.id)} 
                              className="text-slate-300 hover:text-red-500 p-1"
                              title="Obriši bilješku"
                            >
                              <Trash2 size={12}/>
                            </button>
                          )}`;

export function gradeDeletionPermissionsPlugin(): Plugin {
  return {
    name: 'grade-deletion-permissions',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith(TARGET)) return null;
      if (code.includes('GRADE DELETE API ERROR:')) return null;

      let transformed = code;

      transformed = replaceRequired(
        transformed,
        "  const { user, isMainAdmin } = useAuth();",
        "  const { user, isMainAdmin, highestRole, userSchoolRoles } = useAuth();",
        'useAuth destrukturiranje'
      );

      const selectionLine = "  const { selectedSchoolId, selectedClassId: contextClassId, isArchived } = useSelection();";
      transformed = replaceRequired(
        transformed,
        selectionLine,
        selectionLine + '\n\n' + ADMIN_PERMISSION_BLOCK,
        'administratorska provjera'
      );

      transformed = replaceBetween(
        transformed,
        '  const handleDeleteGrade = async (gradeId: string, adminOverride = false) => {',
        '\n\n  const handleDeleteNote = async (noteId: string) => {',
        NEW_DELETE_HANDLER,
        'handleDeleteGrade'
      );

      transformed = replaceRequired(
        transformed,
        "      return;\n    }\n\n    let tableName = '';",
        "      return;\n    }\n" + GRADE_DELETE_CONFIRM_BLOCK + "\n    let tableName = '';",
        'sigurno brisanje u confirmDelete'
      );

      transformed = replaceRequired(
        transformed,
        OLD_HISTORY_ACTIONS,
        NEW_HISTORY_ACTIONS,
        'akcije u povijesti ocjena'
      );

      transformed = replaceRequired(
        transformed,
        "          isMainAdmin={isMainAdmin}\n          showAdminAuth={showAdminDeleteAuth}",
        "          isMainAdmin={isMainAdmin}\n          canAdminDeleteGrades={canAdminDeleteGrades}\n          showAdminAuth={showAdminDeleteAuth}",
        'GradeDetailsModal administratorska ovlast'
      );

      transformed = replaceRequired(
        transformed,
        "  isMainAdmin,\n  showAdminAuth,",
        "  isMainAdmin,\n  canAdminDeleteGrades,\n  showAdminAuth,",
        'GradeDetailsModal prop'
      );

      transformed = replaceRequired(
        transformed,
        `  const selectedClass = classes.find((c: any) => c.id === effectiveClassId);
  const isClassAdmin = isMainAdmin || selectedClass?.homeroomTeacherId === user?.id || selectedClass?.deputyTeacherId === user?.id;
  const canDeleteDirectly = diffMinutes <= 45 || (isClassAdmin && diffMinutes <= 45);
  const canDeleteWithAuth = isClassAdmin && diffMinutes > 45;`,
        `  const gradeTeacherId = grade.teacherId || grade.teacher_id;
  const isCreator = gradeTeacherId === user?.id;
  const canDeleteDirectly = diffMinutes <= 45 && (isCreator || canAdminDeleteGrades);
  const canDeleteWithAuth = canAdminDeleteGrades && diffMinutes > 45;`,
        'GradeDetailsModal pravila brisanja'
      );

      transformed = replaceRequired(
        transformed,
        `                  <input 
                    type="password" 
                    value={authCode}
                    onChange={e => setAuthCode(e.target.value)}
                    placeholder="Unesite kod s authenticatora"
                    className="w-full border border-red-200 p-2 text-center font-mono tracking-[0.5em] focus:outline-red-500"
                    autoFocus
                  />`,
        `                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={authCode}
                    onChange={e => setAuthCode(e.target.value.replace(/\\D/g, '').slice(0, 6))}
                    placeholder="6-znamenkasti kod"
                    className="w-full border border-red-200 p-2 text-center font-mono tracking-[0.5em] focus:outline-red-500"
                    autoFocus
                  />`,
        'polje autentifikatora'
      );

      transformed = replaceRequired(
        transformed,
        `                {diffMinutes > 45 && !isClassAdmin && (
                  <p className="text-[9px] text-gray-400 italic text-center">Ocjena je starija od 45 minuta i ne može se obrisati.</p>
                )}`,
        `                {diffMinutes > 45 && !canAdminDeleteGrades && (
                  <p className="text-[9px] text-gray-400 italic text-center">Nakon 45 minuta ocjenu može obrisati samo administrator uz kod iz autentifikatora. Možete uređivati samo bilješku.</p>
                )}
                {diffMinutes <= 45 && !isCreator && !canAdminDeleteGrades && (
                  <p className="text-[9px] text-gray-400 italic text-center">Ocjenu može obrisati nastavnik koji ju je upisao. Možete uređivati samo bilješku.</p>
                )}`,
        'poruke o ovlastima'
      );

      return { code: transformed, map: null };
    },
  };
}
