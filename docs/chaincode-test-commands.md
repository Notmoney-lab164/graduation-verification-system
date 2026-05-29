# Chaincode Test Commands

## 1. Mục Đích

Tài liệu này hướng dẫn cách chạy Hyperledger Fabric test-network, deploy Java chaincode `graduation`, và test các hàm chính:

- `createStudent`
- `queryStudent`
- `verifyGraduation`
- `verifyStudentIntegrity`

Hệ thống dùng cho đề tài:

```txt
Blockchain-based Student Graduation Verification System using Hyperledger Fabric
## 2. Cấu Trúc Project
Project chính nằm tại:

~/graduation-verification-system
Cấu trúc chính:

graduation-verification-system/
├── frontend/
├── backend/
├── chaincode/
│   └── graduation-java/
├── docs/
└── README.md
Chaincode Java nằm tại:

~/graduation-verification-system/chaincode/graduation-java
## 3. Vào Thư Mục Test Network
Tùy máy, fabric-samples có thể nằm ở một trong hai đường dẫn sau.

Máy hiện tại:

cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
Máy khác có thể là:

cd ~/fabric-samples/test-network
Kiểm tra đúng thư mục bằng lệnh:

ls
Nếu đúng, phải thấy file:

network.sh
4. Chạy Fabric Test Network
Chạy network và tạo channel:

./network.sh up createChannel
Kết quả đúng:

Channel 'mychannel' joined
Kiểm tra container:

docker ps
Phải thấy các container đang Up:

peer0.org1.example.com
peer0.org2.example.com
orderer.example.com
Nếu báo:

channel already exists
thì channel đã có rồi, không cần chạy lại up createChannel.

5. Build Java Chaincode
Vào thư mục chaincode:

cd ~/graduation-verification-system/chaincode/graduation-java
Build:

./gradlew installDist
Nếu bị lỗi test coverage hoặc checkstyle, dùng:

./gradlew installDist -x test -x jacocoTestCoverageVerification -x checkstyleMain -x checkstyleTest
Kết quả đúng:

BUILD SUCCESSFUL
6. Deploy Chaincode
Quay lại test-network:

cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
Hoặc nếu máy dùng đường dẫn khác:

cd ~/fabric-samples/test-network
Deploy lần đầu trên network mới:

./network.sh deployCC -ccn graduation \
-ccp ~/graduation-verification-system/chaincode/graduation-java \
-ccl java \
-ccs 1
Kết quả đúng:

Chaincode definition committed on channel 'mychannel'
Chaincode initialization is not required
Nếu chaincode đã deploy trước đó và Fabric báo cần sequence mới, tăng -ccs.

Ví dụ:

./network.sh deployCC -ccn graduation \
-ccp ~/graduation-verification-system/chaincode/graduation-java \
-ccl java \
-ccs 2
Lưu ý:

Network mới sạch  -> sequence 1
Cập nhật lần sau  -> sequence 2, 3, 4...
Nếu gặp lỗi:

requested sequence 5 is larger than the next available sequence number 1
thì nghĩa là network hiện tại còn mới, phải dùng:

-ccs 1
7. Set Môi Trường Org1
Trước khi chạy peer chaincode invoke hoặc peer chaincode query, cần đứng trong thư mục test-network.

cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
Hoặc:

cd ~/fabric-samples/test-network
Set biến môi trường:

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
8. Tạo Sinh Viên
Lệnh này gọi hàm createStudent.

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
-c '{"function":"createStudent","Args":["SV005","Nguyen Van E","2002-08-15","HASHED_CITIZEN_ID_001","HCMUTE","HCM University of Technology and Education","Faculty of Information Technology","Software Engineering","DEG-2026-0005","Bachelor","GRADUATED","2026-05-26","2026","Good","3.45","150","2022","SIGNATURE_DEMO_001"]}'
Kết quả đúng:

Chaincode invoke successful
9. Truy Vấn Sinh Viên
peer chaincode query \
-C mychannel \
-n graduation \
-c '{"Args":["queryStudent","SV005"]}'
Kết quả đúng sẽ có dạng:

{
  "studentId": "SV005",
  "fullName": "Nguyen Van E",
  "dateOfBirth": "2002-08-15",
  "citizenIdHash": "HASHED_CITIZEN_ID_001",
  "institutionCode": "HCMUTE",
  "institutionName": "HCM University of Technology and Education",
  "facultyName": "Faculty of Information Technology",
  "major": "Software Engineering",
  "degreeId": "DEG-2026-0005",
  "degreeType": "Bachelor",
  "graduationStatus": "GRADUATED",
  "graduationDate": "2026-05-26",
  "graduationYear": "2026",
  "classification": "Good",
  "gpa": "3.45",
  "totalCredits": "150",
  "entranceYear": "2022"
}
10. Kiểm Tra Trạng Thái Tốt Nghiệp
peer chaincode query \
-C mychannel \
-n graduation \
-c '{"Args":["verifyGraduation","SV005"]}'
Kết quả đúng:

GRADUATED
11. Kiểm Tra Toàn Vẹn Dữ Liệu
peer chaincode query \
-C mychannel \
-n graduation \
-c '{"Args":["verifyStudentIntegrity","SV005"]}'
Kết quả đúng:

true
12. Các Lỗi Thường Gặp
Lỗi 1: channel already exists
channel already exists
ledger [mychannel] already exists
Nguyên nhân:

Channel mychannel đã được tạo trước đó.
Cách xử lý:

Không chạy lại ./network.sh up createChannel nữa.
Deploy chaincode trực tiếp.
Lỗi 2: connect refused localhost:7051
connect: connection refused localhost:7051
Nguyên nhân:

peer0.org1.example.com chưa chạy hoặc network chưa up.
Cách kiểm tra:

docker ps
Nếu không thấy peer/orderer, chạy lại:

./network.sh up createChannel
Lỗi 3: Config File "core" Not Found
Config File "core" Not Found
Nguyên nhân:

Đang chạy lệnh peer ở sai thư mục hoặc chưa set FABRIC_CFG_PATH.
Cách xử lý:

cd ~/go/src/github.com/Notmoney-lab164/fabric-samples/test-network
export FABRIC_CFG_PATH=$PWD/../config/
Lỗi 4: crypto path does not exist
the supplied identity is not valid
crypto path does not exist
Nguyên nhân:

Chưa set CORE_PEER_MSPCONFIGPATH hoặc đang đứng sai thư mục.
Cách xử lý:

Quay lại mục 7 và set lại môi trường Org1.
Lỗi 5: requested sequence is larger
requested sequence 5 is larger than the next available sequence number 1
Nguyên nhân:

Network hiện tại chưa từng deploy chaincode, nên sequence đúng là 1.
Cách xử lý:

./network.sh deployCC -ccn graduation \
-ccp ~/graduation-verification-system/chaincode/graduation-java \
-ccl java \
-ccs 1
Lỗi 6: requested sequence must be sequence X
Nguyên nhân:

Chaincode đã deploy rồi, cần tăng sequence.
Cách xử lý:

Dùng đúng sequence Fabric yêu cầu.
Ví dụ nếu Fabric báo phải là sequence 2 thì dùng -ccs 2.
13. Dừng Network
./network.sh down
Nếu cần xóa ledger cũ để reset sạch:

docker volume rm compose_orderer.example.com compose_peer0.org1.example.com compose_peer0.org2.example.com
Lưu ý: chỉ xóa volume khi muốn reset sạch dữ liệu blockchain local.

14. Ghi Chú Bảo Mật
Chaincode hiện tại đã cải thiện bảo mật ở mức demo:

Không lưu CCCD gốc, chỉ lưu citizenIdHash.
Có metadataHash để kiểm tra toàn vẹn dữ liệu.
Có issuerSignature để mô phỏng chữ ký số của đơn vị cấp bằng.
Có organizationMsp để ghi nhận tổ chức tạo bản ghi.
Có ledgerTimestamp để ghi nhận thời điểm giao dịch.
Hàm ghi dữ liệu chỉ cho phép MSP được cấu hình, ví dụ Org1MSP.
Trong môi trường thật nên bổ sung:

Fabric Private Data Collections.
Chữ ký số thật bằng private key của trường.
Backend xác thực người dùng.
HTTPS và phân quyền admin.