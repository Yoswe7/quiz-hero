import sys, os
sys.path.insert(0, os.getcwd())
from app.core.security import create_access_token
from datetime import timedelta
token = create_access_token(data={"user_id":2,"email":"juan.delacruz@cvsu.edu.ph","role":"STUDENT","sub":"juan.delacruz@cvsu.edu.ph"}, expires_delta=timedelta(hours=2))
print(token)