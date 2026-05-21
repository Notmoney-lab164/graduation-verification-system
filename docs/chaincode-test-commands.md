# Chaincode Test Commands

## 1. Cách up network

```bash
cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
./network.sh up createChannel

Channel 'mychannel' joined

cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network

./network.sh deployCC -ccn graduation \
-ccp ~/graduation-verification-system/chaincode/graduation-java \
-ccl java

./network.sh deployCC -ccn graduation \
-ccp ~/graduation-verification-system/chaincode/graduation-java \
-ccl java \
-ccs 4


Chaincode definition committed on channel 'mychannel'


peer chaincode invoke \
-o localhost:7050 \
--ordererTLSHostnameOverride orderer.example.com \
--tls \
--cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
-C mychannel \
-n graduation \
--peerAddresses localhost:7051 \
--tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
--peerAddresses localhost:9051 \
--tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
-c '{"function":"createStudent","Args":["SV003","Le Van C","Software Engineering","GRADUATED","2026-05-21"]}'

peer chaincode query \
-C mychannel \
-n graduation \
-c '{"Args":["queryStudent","SV003"]}'

{"studentId":"SV003","graduationStatus":"GRADUATED","fullName":"Le Van C","major":"Software Engineering","graduationDate":"2026-05-21"}


peer chaincode query \
-C mychannel \
-n graduation \
-c '{"Args":["verifyGraduation","SV003"]}'

GRADUATED

