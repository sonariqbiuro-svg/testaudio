import requests
files = {'file': open('../dummy.wav', 'rb')}
try:
    r = requests.post('http://127.0.0.1:5000/api/analyze', files=files)
    print(r.status_code)
    print(r.text)
except Exception as e:
    print(e)
