import bcrypt from 'bcryptjs';

export const hashPin = async (pin: string): Promise<string> => {
  const saltRounds = 10;
  return await bcrypt.hash(pin, saltRounds);
};

export const verifyPin = async (pin: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(pin, hash);
};
