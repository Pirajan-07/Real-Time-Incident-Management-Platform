import bcrypt
hash_val = b'$2b$12$mTdcCmN3gLpGBJuHqVOIX.CtSCEUFVFyQvF2ioOenKRmJa6lbRWNu'
print("admin123 (.env.example):", bcrypt.checkpw(b'admin123', hash_val))
