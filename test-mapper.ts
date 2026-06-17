
const mapper = (raw: any) => {
    const fullName = raw.name || '';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    return { name: firstName, surname: lastName };
};

const raw = { name: 'Viktor Beljan' };
console.log('Mapper raw:', raw);
console.log('Mapper result:', mapper(raw));
