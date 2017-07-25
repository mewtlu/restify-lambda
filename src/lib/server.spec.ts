import * as chai from "chai";
const should = chai.should()
const expect = chai.expect

import * as restifyErrors from 'restify-errors'
import Response from './response'
import Request from './request'
import Server from './server'
import { ServerOptions } from './server_options'
import { lambdaCallback } from './lambda_callback'
import { EventSource, PartialEventSource, httpMethod } from './event_source'
const sampleEventSource: EventSource = require('../../tests/data/sample_event_source')
import Logger from './logger'
import * as errors from 'restify-errors'
import * as utils from './utils'

let responseError, response

function createModel(serverOptions?: ServerOptions): Server {
    return new Server(Object.assign({}, {
        logLevel: Logger.DEBUG
    }, serverOptions))
}
function createEventSource(customEventSource?: PartialEventSource) {
    if (customEventSource && customEventSource.headers) {
        customEventSource.headers = Object.assign({}, sampleEventSource.headers, customEventSource.headers)
    }
    return Object.assign({}, sampleEventSource, customEventSource || {})
}
function createlambdaCallback(next?) {
    return function (error, result) {
        responseError = error
        response = result
        if (next) {
            next(error, result)
        }
    } as lambdaCallback
}
function triggerRequest(server: Server, customEventSource?: PartialEventSource, onResponse?) {
    server.handlelambdaEvent(createEventSource(customEventSource), createlambdaCallback(onResponse))
}


describe('Server', function () {

    let server: Server
    beforeEach(function () {
        server = createModel()
    })

    function testSuccessModelResponse() {
        expect(responseError).to.be.null
        expect(response).to.be.an('object')
    }
    function testHeaderInModelResponse(name: string, value?: any) {
        testSuccessModelResponse()
        let t = expect(response.headers).to.be.an('object')
        if (value) {
            t.with.property(name, value)
        }
        else {
            t.with.property(name)
        }
    }
    function testStatusCodeInModelResponse(code: number) {
        testSuccessModelResponse()
        response.should.have.property('statusCode', code + '')
    }
    function testBodyInModelResponse(body: string, contentType?: string, contentLength?: number) {
        testSuccessModelResponse()
        response.should.have.property('body', body)
        if (contentType !== undefined) {
            expect(response.headers).to.be.an('object').with.property('content-type', contentType)
        }
        if (contentLength !== undefined) {
            expect(response.headers).to.be.an('object').with.property('content-length', contentLength)
        }
    }
    async function makeRequest(url, method: httpMethod = 'GET', headers: any = {}, body = '') {
        return await utils.promiseFromCallback<any>(function (next) {
            triggerRequest(server, {
                body: body,
                headers: headers,
                httpMethod: method,
                path: url
            }, next)
        })
    }

    describe('pre', function () {
        it('should register pre handler', function (done) {
            server.pre(function (req, res, next) {
                (req as any).someValue = 23
                return next()
            })
            server.get('/r1', function (req, res) {
                should.equal((req as any).someValue, 23)
                done()
            })
            triggerRequest(server, {
                path: "/r1",
                httpMethod: "GET"
            })
        })
        it('should register multiple pre handler', function (done) {
            server.pre(function (req, res, next) {
                (req as any).someValue = 23
                return next()
            }, function (req, res, next) {
                (req as any).someOtherValue = 24
                return next()
            })
            server.get('/r1', function (req, res) {
                should.equal((req as any).someValue, 23)
                should.equal((req as any).someOtherValue, 24)
                done()
            })
            triggerRequest(server, {
                path: "/r1",
                httpMethod: "GET"
            })
        })
        it('prerouting - pre handler throws error', function (done) {
            server.pre(function (req, res, next) {
                next(new errors.BadRequestError('abc'))
            })
            server.get('/r1', function (req, res) {
                chai.assert.notOk("Should not have reached")
            })
            triggerRequest(server, {
                path: "/r1",
                httpMethod: "GET"
            }, function () {
                testStatusCodeInModelResponse(400)
                testBodyInModelResponse('BadRequestError: abc')
                done()
            })

        })
        it('prerouting - handlers should be fired even if no route was selected', function (done) {
            server.pre(function (req, res, next) {
                next()
            })
            triggerRequest(server, {
                path: 'nosuchpath'
            }, function () {
                testStatusCodeInModelResponse(404)
                done()
            })
        })
        it('prerouting - next(false) should skip the remaining handlers', function (done) {
            server.pre(function (req, res, next) {
                res.send('some')
                next(false)
            })
            server.get('/some/path', function (req, res, next) {
                chai.assert.notOk('Should not be reached')
            })
            triggerRequest(server, {
                path: '/some/path'
            }, function () {
                testStatusCodeInModelResponse(200)
                testBodyInModelResponse('some')
                done()
            })
        })
    })

    describe('use', function () {
        it('should register handler', function (done) {
            server.use(function (req, res, next) {
                (req as any).someValue = 23
                return next()
            })
            server.get('/r1', function (req, res) {
                should.equal((req as any).someValue, 23)
                done()
            })
            triggerRequest(server, {
                path: "/r1",
                httpMethod: "GET"
            })
        })
        it('should register multiple handler', function (done) {
            server.use(function (req, res, next) {
                (req as any).someValue = 23
                return next()
            }, function (req, res, next) {
                (req as any).someOtherValue = 24
                return next()
            })
            server.get('/r1', function (req, res) {
                should.equal((req as any).someValue, 23)
                should.equal((req as any).someOtherValue, 24)
                done()
            })
            triggerRequest(server, {
                path: "/r1",
                httpMethod: "GET"
            })
        })
        it('handler should run after pre handlers', function (done) {
            server.use(function (req, res, next) {
                should.equal((req as any).someValue, 23)
                next()
            })
            server.pre(function (req, res, next) {
                (req as any).someValue = 23
                next()
            })
            server.get('/r1', function (req, res) {
                done()
            })
            triggerRequest(server, {
                path: "/r1",
                httpMethod: "GET"
            })
        })
        it('handler should only run when route has matched', function (done) {
            server.use(function (req, res, next) {
                chai.assert.notOk('should not have reached')
                next()
            })
            triggerRequest(server, {
                path: "nosuchpath",
                httpMethod: "GET"
            })
            setTimeout(done, 20)
        })
    })

    describe('params support', function () {
        it('should match and provide params', async () => {
            server.get('/users/:id/:task', function (req, res, next) {
                res.send(req.params.id + ':' + req.params.task)
            })
            await makeRequest('/users/23/delete')
            testBodyInModelResponse('23:delete')
        })
    })
    describe('version support', function () {

        function checkInvalidVersionError() {
            testStatusCodeInModelResponse(400)
            response.should.have.property('body')
            response.body.should.include('InvalidVersionError')
        }

        it('should allow different version to coexist', async () => {
            server.get({ path: '/vr', version: '1.1.3' }, function (req, res) {
                res.send('1.1.3')
            })
            server.get({ path: '/vr', version: '2.0.1' }, function (req, res) {
                res.send('2.0.1')
            })

            await makeRequest('/vr', 'GET', {
                'accept-version': '~1'
            })
            testBodyInModelResponse('1.1.3')

            await makeRequest('/vr', 'GET', {
                'accept-version': '~2'
            })
            testBodyInModelResponse('2.0.1')
        })

        it('should throw version error if no valid one exist', async () => {
            server.get({ path: '/vr', version: '1.1.3' }, function (req, res) {
                res.send('1.1.3')
            })
            await makeRequest('/vr', 'GET', {
                'accept-version': '~2'
            })
            checkInvalidVersionError()
        })
        it('should use latest once if no version specified', async () => {
            server.get({ path: '/vr', version: '1.1.3' }, function (req, res) {
                res.send('1.1.3')
            })
            server.get({ path: '/vr', version: '2.0.1' }, function (req, res) {
                res.send('2.0.1')
            })

            await makeRequest('/vr')
            testBodyInModelResponse('2.0.1')
        })
        it('should support versionedUse', async () => {
            server.versionedUse(['1.0.1', '2.0.3'], function (req, res) {
                res.send('1,2')
            })
            server.versionedUse('3.1.2', function (req, res) {
                res.send('3')
            })
            server.get({ path: '/v', version: ['1.0.1', '2.0.3', '3.1.2', '4.0.1'] }, function (req, res) {
                res.send('nv')
            })
            await makeRequest('/v', 'GET', {
                'accept-version': '~3'
            })
            testBodyInModelResponse('3')
            await makeRequest('/v', 'GET', {
                'accept-version': '~1'
            })
            testBodyInModelResponse('1,2')
            await makeRequest('/v', 'GET', {
                'accept-version': '~4'
            })
            testBodyInModelResponse('nv')
            await makeRequest('/v', 'GET')
            testBodyInModelResponse('nv')

        })

        it('should respect server.versions option', async () => {
            
            server.get('/p', function(req, res) {
                res.send('a')
            })
            server.get({path: '/p', version: '2.1.1'}, function(req, res) {
                res.send('b')
            })
            await makeRequest('/p', 'GET', {
                'accept-version': '~1'
            })
            checkInvalidVersionError()

            server = createModel({
                versions: ['1.0.1']
            })

            server.get('/p', function(req, res) {
                res.send('a')
            })
            server.get({path: '/p', version: '2.1.1'}, function(req, res) {
                res.send('b')
            })
            await makeRequest('/p', 'GET', {
                'accept-version': '~1'
            })
            testBodyInModelResponse('a')

        })
    })
    describe('routing', function () {
        it('should differentiate between different verbs', async () => {
            server.get('/p', function (req, res) {
                res.send('g')
            })
            server.post('/p', function (req, res) {
                res.send('p')
            })
            await makeRequest('/p', 'GET')
            testBodyInModelResponse('g')
            await makeRequest('/p', 'POST')
            testBodyInModelResponse('p')
        })
        it('should throw invalid method error if wrong method', async () => {
            server.get('/p', (req, res) => { })

            await makeRequest('/p', 'POST')

            testStatusCodeInModelResponse(405)
            response.should.have.property('body').which.includes('MethodNotAllowedError')
        })
        it('should respect strictRouting option', async () => {

            server.get('/q', (req, res) => {
                res.send('1')
            })
            await makeRequest('/q/')
            testStatusCodeInModelResponse(200)

            server = createModel({
                strictRouting: true
            })
            server.get('/p', (req, res) => {
                res.send('1')
            })
            await makeRequest('/p/')
            testStatusCodeInModelResponse(404)
        })
    })
    describe('custom formatters', function () {
        it('should support formatters option', async () => {
            server = createModel({
                formatters: {
                    'text/html': function (req: Request, res: Response, body: any) {
                        let data = body ? body.toString() : ''
                        data = '['+data+']'
                        res.setHeader('Content-Length', Buffer.byteLength(data))
                        return data
                    }
                }
            })

            server.get('/p', function(req, res) {
                res.send('a')
            })

            await makeRequest('/p')
            testBodyInModelResponse('[a]')
        })
    })

    describe('body parser', function() {
        it('should parse urlencoded body', async () => {
            
            server.post('/p', function(req, res) {
                res.json(req.body)
            })

            await makeRequest('/p', 'POST', {
                'content-type': 'application/x-www-form-urlencoded'
            }, 'a=12&b=c&d=1&d=2')

            testSuccessModelResponse()
            response.should.have.property('body')
            const b = JSON.parse(response.body)
            b.should.have.property('a', '12')
            b.should.have.property('b', 'c')
            b.should.have.property('d').which.is.an('array').which.is.deep.equal(['1','2'])
        })

        it('should parse json body', async () => {
            server.post('/p', function(req, res) {
                res.json(req.body)
            })

            await makeRequest('/p', 'POST', {
                'content-type': 'application/json'
            }, JSON.stringify({a: 1, b: 2}))

            testSuccessModelResponse()
            response.should.have.property('body')
            const b = JSON.parse(response.body)
            b.should.have.property('a', 1)
            b.should.have.property('b', 2)
        })

        it('should not parse when server.dontParseBody is set to true', async () => {
            server = createModel({
                dontParseBody: true
            })
            server.post('/p', function(req, res) {
                res.send(req.body)
            })

            await makeRequest('/p', 'POST', {
                'content-type': 'application/x-www-form-urlencoded'
            }, 'a=12&b=c&d=1&d=2')

            testSuccessModelResponse()
            response.should.have.property('body', 'a=12&b=c&d=1&d=2')
        })
    })
})