process.env.HPE_PARTSURFER_THROTTLE_MS =
  process.env.HPE_PARTSURFER_THROTTLE_MS ?? '0';
delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;

const nock = require('nock');

beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});
