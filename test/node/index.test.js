const sinon = require('sinon');
const _ = require('lodash');
const AsyncEvents = require('../../index');

let ae = new AsyncEvents();

const cb1 = sinon.spy();
const cb2 = sinon.spy();
const cb3 = sinon.spy();
const cb4 = sinon.spy();

describe(`em-async-events`, function () {
  it(`creates a once listener with basic information`, async function () {
    ae.onceEvent('huga', cb1);
    
    expect('huga' in ae.events).toBeTrue();
  });
  
  it(`can detect the listener using hasListener`, async function () {
    ae.onceEvent('huga', cb1);
    
    expect(ae.hasListener('huga')).toBeTrue();
  });
});
