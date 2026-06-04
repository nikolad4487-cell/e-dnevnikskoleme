SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'reading_assignments' 
AND constraint_type = 'UNIQUE';
