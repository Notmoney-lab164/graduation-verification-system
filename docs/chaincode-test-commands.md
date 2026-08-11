# Hướng dẫn test Hyperledger Fabric Chaincode

## 1. Mục đích

Tài liệu này hướng dẫn chạy và kiểm tra Java chaincode `graduation` của hệ thống xác minh tốt nghiệp.

```text
React Frontend
  -> FastAPI Backend
  -> MySQL lưu hồ sơ sinh viên đầy đủ
  -> Hyperledger Fabric lưu mã hash xác minh
```

Hash xác minh hiện được tạo từ ba trường:

```text
student_id + gpa + graduation_status
```

## 2. Cấu hình Fabric

| Nội dung | Giá trị |
|---|---|
| Channel | `mychannel` |
| Chaincode | `graduation` |
| Peer Org1 | `localhost:7051` |
| Peer Org2 | `localhost:9051` |
| Orderer | `localhost:7050` |

Đường dẫn dự án:

```text
Project: ~/graduation-verification-system
Java chaincode: ~/graduation-verification-system/chaincode/graduation-java
Fabric test-network: ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
```

## 3. Kiểm tra Fabric đang chạy

```bash
docker ps
```

Kết quả cần có:

```text
peer0.org1.example.com
peer0.org2.example.com
orderer.example.com
couchdb0
couchdb1
```

## 4. Bật lại network cũ sau khi tắt máy

Nếu muốn giữ ledger và dữ liệu Fabric cũ, không chạy `network.sh down` hoặc `network.sh up createChannel` ngay.

Chạy:

```bash
docker start \
  orderer.example.com \
  couchdb0 \
  couchdb1 \
  peer0.org1.example.com \
  peer0.org2.example.com
```

Sau đó kiểm tra lại:

```bash
docker ps
```

## 5. Tạo network mới

Chỉ dùng khi muốn reset toàn bộ Fabric local.

```bash
cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
./network.sh up createChannel -s couchdb
```

Kết quả đúng:

```text
Channel 'mychannel' joined
```

## 6. Build Java chaincode

```bash
cd ~/graduation-verification-system/chaincode/graduation-java
./gradlew build
```

Kết quả đúng:

```text
BUILD SUCCESSFUL
```

Lệnh này kiểm tra lỗi Java, compile chaincode và chạy test nếu có. Nó chưa deploy chaincode và chưa ghi dữ liệu vào Blockchain.

## 7. Deploy chaincode trên network mới

```bash
cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network

./network.sh deployCC \
  -ccn graduation \
  -ccp ~/graduation-verification-system/chaincode/graduation-java \
  -ccl java \
  -ccv 1.0 \
  -ccs 1
```

Kết quả đúng:

```text
Chaincode definition committed on channel 'mychannel'
Query chaincode definition successful on peer0.org1
Query chaincode definition successful on peer0.org2
```

Network mới dùng `-ccs 1`. Khi sửa chaincode và deploy lại trên cùng network, tăng version và sequence, ví dụ `-ccv 2.0 -ccs 2`.

## 8. Thiết lập môi trường Fabric CLI

```bash
cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

source ./scripts/envVar.sh
setGlobals 1

export ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
export PEER0_ORG1_CA=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export PEER0_ORG2_CA=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
```

Kiểm tra MSP đang dùng:

```bash
echo $CORE_PEER_LOCALMSPID
```

Kết quả là `Org1MSP`.

## 9. Query: đọc dữ liệu Blockchain

`query` chỉ đọc dữ liệu, không tạo transaction mới và không thay đổi ledger.

Đếm số sinh viên:

```bash
peer chaincode query -C mychannel -n graduation \
  -c '{"Args":["countStudents"]}'
```

Kiểm tra sinh viên có tồn tại không:

```bash
peer chaincode query -C mychannel -n graduation \
  -c '{"Args":["studentExists","SVFAB012"]}'
```

Xem thông tin sinh viên:

```bash
peer chaincode query -C mychannel -n graduation \
  -c '{"Args":["queryStudent","SVFAB012"]}' | jq
```

Kiểm tra trạng thái tốt nghiệp:

```bash
peer chaincode query -C mychannel -n graduation \
  -c '{"Args":["verifyGraduation","SVFAB012"]}'
```

## 10. Invoke: ghi dữ liệu vào Blockchain

`invoke` ghi hoặc thay đổi dữ liệu và tạo transaction mới.

Project này yêu cầu Org1 và Org2 cùng endorse giao dịch. Vì vậy lệnh invoke phải có cả hai peer:

```bash
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "$ORDERER_CA" \
  -C mychannel \
  -n graduation \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "$PEER0_ORG1_CA" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "$PEER0_ORG2_CA" \
  --waitForEvent \
  -c '{"Args":["createStudent","SVFAB020","3.20","GRADUATED"]}'
```

Kết quả đúng:

```text
committed with status (VALID) at localhost:7051
committed with status (VALID) at localhost:9051
```

Không gọi `createStudent` lại với MSSV đã tồn tại.

## 11. Luồng thật qua FastAPI

Trong hệ thống thật, admin không cần gõ CLI để tạo sinh viên.

```text
Admin React page
  -> POST /api/admin/students
  -> FastAPI lưu hồ sơ vào MySQL
  -> Backend tạo hash
  -> Backend invoke Fabric
  -> Org1 và Org2 endorse
  -> Fabric commit transaction
  -> Backend lưu blockchain_tx_id vào MySQL
```

Khi người dùng xác minh:

```text
GET /api/verify/{student_id}
  -> Backend tính hash hiện tại từ MySQL
  -> Backend query hash trên Fabric
  -> Trả về Verified hoặc Mismatch
```

## 12. Test Mismatch

Sửa trực tiếp GPA trong MySQL:

```sql
UPDATE students
SET gpa = 1.00
WHERE student_id = 'SVFAB012';
```

Gọi lại API:

```text
GET /api/verify/SVFAB012
```

Kết quả phải là `Mismatch`.

Khôi phục GPA gốc:

```sql
UPDATE students
SET gpa = 3.20
WHERE student_id = 'SVFAB012';
```

Verify lại sẽ trả `Verified`.

## 13. Lỗi thường gặp

### channelID is empty

Nguyên nhân: thiếu `-C mychannel`.

```text
-C = tên channel
-c = JSON Args của chaincode
```

### connection refused localhost:7051

Nguyên nhân: peer chưa chạy. Kiểm tra `docker ps` và bật lại container cũ nếu cần.

### ENDORSEMENT_POLICY_FAILURE

Nguyên nhân: invoke chỉ gửi đến Org1, thiếu Org2. Thêm đủ hai `--peerAddresses` và TLS certificate tương ứng.

### STUDENT_ALREADY_EXISTS

Nguyên nhân: MSSV đã tồn tại trên Fabric. Dùng MSSV mới hoặc dùng `queryStudent`.

### Permission denied

Nguyên nhân thường do đã từng chạy Fabric bằng `sudo`.

```bash
cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
sudo chown -R $USER:$USER organizations channel-artifacts
```

Sau đó không dùng `sudo` cho `network.sh`.

## 14. Bảo mật

- Không lưu CCCD gốc trên Fabric.
- Không push `backend/.env` lên GitHub.
- Chỉ push `backend/.env.example`.
- Không public `SECRET_KEY`, mật khẩu MySQL, Fabric private key hoặc certificate.
- Frontend không hiển thị hash thô cho người dùng public.

Vì bạn nói chaincode chưa thay đổi gì và muốn dùng bản cũ hôm qua, thì chỉ cần đảm bảo network đang chạy và chaincode cũ đã committed.
Bạn chỉ chạy kiểm tra thôi:

cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network

export PATH=~/go/src/github.com/Notmoney-lab164/fabric-samples/bin:$PATH
export FABRIC_CFG_PATH=~/go/src/github.com/Notmoney-lab164/fabric-samples/config

source scripts/envVar.sh
setGlobals 1

peer lifecycle chaincode querycommitted \
  --channelID mychannel \
  --name graduation