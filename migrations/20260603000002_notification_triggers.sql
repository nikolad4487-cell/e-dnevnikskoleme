-- Trigger for Grades
CREATE OR REPLACE FUNCTION public.notify_grade_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.student_id, 'Nova ocjena', 'Dobili ste novu ocjenu iz nekog predmeta.', 'GRADE', '/student/ocjene');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_grade_insert ON public.grades;
CREATE TRIGGER trg_notify_grade_insert
    AFTER INSERT ON public.grades
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_grade_insert();


-- Trigger for Absences
CREATE OR REPLACE FUNCTION public.notify_absence_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.student_id, 'Novi izostanak', 'Dobili ste novi izostanak.', 'ABSENCE', '/student/izostanci');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_absence_insert ON public.absences;
CREATE TRIGGER trg_notify_absence_insert
    AFTER INSERT ON public.absences
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_absence_insert();
