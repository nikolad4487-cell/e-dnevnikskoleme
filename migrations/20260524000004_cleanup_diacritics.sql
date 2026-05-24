-- Migracija za ispravak i vraćanje dijakritika u bazi podataka za predefinirane i uobičajene primjere
UPDATE user_profiles
SET name = REPLACE(name, 'Kovac', 'Kovač')
WHERE name LIKE '%Kovac%';

UPDATE user_profiles
SET name = REPLACE(name, 'Duric', 'Đurić')
WHERE name LIKE '%Duric%';

UPDATE user_profiles
SET name = REPLACE(name, 'Majdic', 'Majdić')
WHERE name LIKE '%Majdic%';

UPDATE user_profiles
SET name = REPLACE(name, 'Malcic', 'Malčić')
WHERE name LIKE '%Malcic%';

UPDATE user_profiles
SET name = REPLACE(name, 'Zidanic', 'Židanić')
WHERE name LIKE '%Zidanic%';
