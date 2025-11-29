from command_utils import executeCommandWithOutputs
import sys

def testRepository(reponame:str):
    args = ["npm", 'run', 'test' ]
    print("::group::Unit tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )
    args = ["npm", 'run', 'cypress' ]
    print("::group::Cypress Components tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )

def testall(package:str)->bool:
    testRepository(package)
    import os
    if os.path.isdir(os.path.join("cypress", "e2e")):
        print("::group::Cypress run tests")
        executeCommandWithOutputs(["npx", "cypress", "run"],sys.stderr, sys.stdout)
        print( '::endgroup::' )
    else:
        print("No Cypress e2e tests found in " + os.getcwd(), file=sys.stderr)
