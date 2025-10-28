let prefix = ''
let defaultm2mPort = 3005
let mqttAuthorizedPort = 3001
let mqttUnAuthorizedPort = 3003
let localhost="127.0.0.1"
function runBusses(willLog) {
  let logSetting = { log: willLog }
  cy.log('Configure Bus')
  cy.task('log','Configure Bus')

  cy.url().should('contain', prefix + '/busses')
  cy.get('[role="tab"] ', logSetting).eq(1, logSetting).click(logSetting)
  cy.get('[formcontrolname="host"]', logSetting).type(backspaces(10) + localhost, { force: true, log: willLog })
  cy.get('[formcontrolname="port"]', logSetting).type(backspaces(10) + '3002', { force: true, log: willLog })
  cy.get('[formcontrolname="timeout"]', logSetting)
    .eq(0, logSetting)
    .type(backspaces(10) + '500', { force: true, log: willLog })
  cy.get('[formcontrolname="host"]', logSetting).trigger('change', logSetting)
  cy.get('div.card-header-buttons button:first', logSetting).eq(0).click({ force: true, log: willLog })
  // List slaves second header button on first card
  cy.get('div.card-header-buttons:first button').eq(1, logSetting).click({ force: true, log: willLog })
}

function runSlaves(willLog) {
  let logSetting = { log: willLog }
  cy.log('Create Slave')
  cy.url().should('contain', prefix + '/slaves')
  cy.get('[formcontrolname="slaveId"]', logSetting).type('3{enter}', { force: true, log: willLog })
  // Show specification third header button on first card

  cy.get('div.card-header-buttons:first button ', logSetting).eq(1, logSetting).click(logSetting)
  cy.get('div.card-header-buttons:first button ', logSetting).eq(2, logSetting).click(logSetting)
  cy.url().should('contain', prefix + '/specification')
}
function setUrls(willLog) {
  let logSetting = { log: willLog }
  cy.log('Set Upload files URLs')
  cy.get('app-upload-files:first mat-expansion-panel-header', logSetting).eq(1, logSetting).click(logSetting)
  cy.get('app-upload-files:first input[type!="file"]', logSetting)
    .eq(1, logSetting)
    .focus(logSetting)
    .type('http://' + localhost + '/test.png', { force: true, log: willLog })
  cy.get('app-upload-files:first button mat-icon:contains("add")', logSetting)
    .eq(1, logSetting)
    .click({ force: true, log: willLog })

  cy.get('app-upload-files:first mat-expansion-panel-header', logSetting).eq(0, logSetting).click(logSetting)
  cy.get('app-upload-files:first input[type!="file"]', logSetting)
    .eq(0, logSetting)
    .focus(logSetting)
    .type('http://' + localhost + '/test.pdf', { force: true, log: willLog })
  cy.get('app-upload-files:first button mat-icon:contains("add")', logSetting)
    .eq(0, logSetting)
    .click({ force: true, log: willLog })
    .wait(1000)
}
function addEntity(entitynum, modbusAddress, willLog) {
  let logSetting = { log: willLog }
  cy.log('Add entity ' + entitynum)
  cy.get('app-entity:last mat-expansion-panel-header[aria-expanded=false]', logSetting).then((elements) => {
    if (elements.length >= 1) {
      elements[0].click(logSetting)
    }
    if (elements.length >= 2) {
      elements[1].click(logSetting)
    }
  })

  //  cy.get('app-entity:last mat-expansion-panel-header',logSetting).eq(0,logSetting).click(logSetting)
  cy.get('app-entity:last [formcontrolname="name"]', logSetting).type('the entity' + entitynum + '{enter}', {
    force: true,
    log: willLog,
  })
  cy.get('app-entity:last [formcontrolname="modbusAddress"]', logSetting).type('{backspace}' + modbusAddress + '{enter}', {
    force: true,
    log: willLog,
  })
  cy.get('app-entity:last mat-select[formControlName="converter"]', logSetting)
    .click(logSetting)
    .get('mat-option')
    .contains('number')
    .click(logSetting)
  cy.get('app-entity:last [formcontrolname="min"]', logSetting).type('0', { force: true, log: willLog })
  cy.get('app-entity:last [formcontrolname="max"]', logSetting).type('1000', { force: true, log: willLog })

  cy.get('app-entity:last mat-select[formControlName="registerType"]', logSetting)
    .click()
    .get('mat-option')
    .contains('Holding')
    .click()
  cy.get('app-entity:last [formControlName="readonly"]', logSetting).click(logSetting)
  cy.get('app-entity:last mat-card mat-card-header button:has(mat-icon:contains("add_circle"))', logSetting)
    .last()
    .click({ force: true, log: willLog })

}
function saveSpecification(willLog) {
  let logSetting = { log: willLog }
  
  cy.log('Save Specification ')
  cy.task('log','Save Specification ' )
  cy.get('div.saveCancel:first button', logSetting).eq(0, logSetting).should('not.is.disabled')
  cy.get('div.saveCancel:first button', logSetting).eq(0, logSetting).last().click({ force: true, log: willLog })
  // cy.wait(1000)
  cy.get('div.saveCancel:first button', logSetting).eq(1, logSetting).last().click({ force: true, log: willLog })
  // cy.wait(1000)
  // cy.url().should('contain', prefix + '/slaves')
}
function addSlave(willLog) {
  let logSetting = { log: willLog }
  cy.log('Add Slave ')
  cy.task('log','Add Slave' )
  cy.url().then((url)=>{
  cy.task('log',url )

  })
  cy.url().should('contain', prefix + '/slaves')
  cy.get('[formcontrolname="detectSpec"]', logSetting).click(logSetting)
  cy.get('[formcontrolname="slaveId"]', logSetting).type('3{enter}', { force: true, log: willLog })
  cy.get('app-select-slave:first mat-expansion-panel-header[aria-expanded=false]', logSetting).then((elements) => {
    if (elements.length >= 1) {
      elements[0].click(logSetting)
    }
    if (elements.length >= 2) {
      elements[1].click(logSetting)
    }
  })

  cy.get('app-select-slave:first mat-select[formControlName="pollMode"]', logSetting)
    .click()
    .get('mat-option')
    .contains('No polling')
    .click(logSetting)
  cy.get('div.card-header-buttons:first button:contains("check_circle")', logSetting).eq(0, logSetting).click(logSetting)
  // Show specification third header button on first card
  cy.get('div.card-header-buttons:first button:contains("add_box")', logSetting).eq(0, logSetting).click(logSetting)

  cy.url().should('contain', prefix + '/specification')
}
function validateMqtt(willLog) {
  let logSetting = { log: willLog }
  return new Promise((resolve) => {
    cy.log('Validate MQTT')
    cy.task('mqttResetTopicAndPayloads', logSetting).then(() => {
      cy.task('mqttGetTopicAndPayloads', logSetting).then((tAndP) => {
        cy.log('tAndP ' + JSON.stringify(tAndP))
      })
    })
  })
}
function backspaces(num) {
  let rc = ''
  for (let a = 0; a < num; a++) rc = rc + '{backspace}'
  return rc
}
function e2eReset(log){ 
  cy.task("e2eServicesStop", log)
  cy.task("e2eServicesStart", log)

}
let logSetting = { log: true }

describe('MQTT Discovery Tests', () => {
  // before(() => {
    // wait for all tests then 
    //cy.task('e2eInitServicesStop', logSetting)
    //cy.task('e2eInitServicesStart', logSetting)

  // })
  after(() => {
    // wait for all tests then 
    //cy.task('e2eInitServicesStop', logSetting)
    cy.task('e2eServicesStop', logSetting)
  })

  it(
    'mqtt hassio addon',
    {
      retries: {
        runMode: 0,
        openMode: 0,
      },
    },
    () => {
      Cypress.config('defaultCommandTimeout', 20000)
      logSetting.log = true
      let addonConfig = undefined;
      e2eReset( logSetting)
      prefix = 'ingress'
      cy.visit('http://' + localhost + ':' + Cypress.env('nginxAddonHttpPort') +'/' + prefix, logSetting)
      // monitor discovery topics
      let mqttConnect = Cypress.env('mqttconnect')
      assert(mqttConnect != undefined)
      cy.log('MQTT connect')
      cy.task('mqttConnect', mqttConnect, logSetting).then(() => {
        cy.task('mqttSubscribe', '#', logSetting).then((tAndP) => {
          cy.task('mqttResetTopicAndPayloads')
          runBusses(true)
          addSlave(true)
          cy.log('Configure Specification name')
          cy.get('#specForm [formcontrolname="name"]', { log: false }).type(backspaces(10) + 'the spec{enter}', {
            force: true,
            log: logSetting.log,
          })

          setUrls(true)
          addEntity(1, 1, false)
          addEntity(2, 3, false)
          saveSpecification(true)
          //Homeassistant needs time between discovery and state sending
          cy.wait(1000)
            .task('mqttGetTopicAndPayloads')
            .then((tAndP) => {
              //expect(tAndP.length).to.eq(2)
              let idx = tAndP.findIndex((tp) => tp.payload == 'online')
              if (idx == -1) console.log(tAndP)
              expect(idx).not.to.eq(-1)
              idx = tAndP.findIndex((tp) => tp.topic.endsWith('/state/'))
              if (idx == -1) console.log(tAndP)
              expect(idx).not.to.eq(-1)
              expect(tAndP.filter((tp) => tp.topic.startsWith('homeassistant/')).length).to.eq(2)
            })
          cy.task("getTempDir",Cypress.env("modbus2mqttAddonHttpPort").toString()).then((tmpdir)=>{
            cy.readFile( tmpdir + '/modbus2mqtt/specifications/files/thespec/files.yaml').should('exist')
          })
        })
      })
    }
  )
})
