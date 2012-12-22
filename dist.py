import os
import json

def exec_command(cmd):
    print cmd
    os.system(cmd)

version = json.loads(open("metadata.json").read())['version']

exec_command("zip -j gajim@base-art.net-%d.zip extension.js metadata.json" % version)
exec_command("git tag %d" * version)

