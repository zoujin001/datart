import { Form } from 'antd';
import { LoadingMask } from 'app/components';
import classnames from 'classnames';
import { memo, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components/macro';
import {
  CREATE_PERMISSION_VALUES,
  MODULE_PERMISSION_VALUES,
  PermissionLevels,
  ResourceTypes,
  RESOURCE_TYPE_LABEL,
  SubjectTypes,
  Viewpoints,
} from '../../constants';
import { makeSelectPrivileges } from '../../slice/selectors';
import { grantPermissions } from '../../slice/thunks';
import {
  DataSourceTreeNode,
  DataSourceViewModel,
  GrantPermissionParams,
  Privilege,
} from '../../slice/types';
import { getDefaultPermissionArray } from '../../utils';
import { IndependentPermissionSetting } from './IndependentPermissionSetting';
import { PermissionTable } from './PermissionTable';
import {
  calcPermission,
  getChangedPermission,
  getIndependentPermissionChangeParams,
  getPrivilegeResult,
  getRecalculatedPrivileges,
  getTreeNodeWithPermission,
} from './utils';

interface PermissionFormProps {
  viewpoint: Viewpoints;
  viewpointType: ResourceTypes | SubjectTypes;
  viewpointId: string;
  selected: boolean;
  orgId: string;
  dataSourceType: ResourceTypes | SubjectTypes;
  dataSource: DataSourceViewModel[] | undefined;
  resourceLoading: boolean;
  permissionLoading: boolean;
}

export const PermissionForm = memo(
  ({
    viewpoint,
    viewpointType,
    viewpointId,
    selected,
    orgId,
    dataSourceType,
    dataSource,
    permissionLoading,
    resourceLoading,
  }: PermissionFormProps) => {
    const dispatch = useDispatch();
    const selectPrivileges = useMemo(makeSelectPrivileges, []);
    const privileges = useSelector(state =>
      selectPrivileges(state, { viewpoint, dataSourceType }),
    );

    const { moduleEnabled, createEnabled } = useMemo(() => {
      let moduleEnabled = PermissionLevels.Disable;
      let createEnabled = PermissionLevels.Disable;
      privileges?.forEach(({ resourceId, permission }) => {
        if (resourceId === '*') {
          moduleEnabled = permission;
        }
        if (resourceId === dataSourceType) {
          createEnabled = permission;
        }
      });
      return { moduleEnabled, createEnabled };
    }, [privileges, dataSourceType]);

    const independentPermissionChange = useCallback(
      resourceId => e => {
        if (privileges) {
          const val = e.target.value;
          const params = getIndependentPermissionChangeParams(
            resourceId,
            val,
            privileges!,
            orgId,
            viewpointId,
            viewpointType as SubjectTypes,
            dataSourceType as ResourceTypes,
          );
          dispatch(
            grantPermissions({
              params,
              options: {
                viewpoint,
                viewpointType,
                dataSourceType,
                reserved: val
                  ? privileges
                  : privileges.filter(p => p.resourceId !== resourceId),
              },
              resolve: () => {},
            }),
          );
        }
      },
      [
        dispatch,
        viewpoint,
        viewpointType,
        viewpointId,
        dataSourceType,
        privileges,
        orgId,
      ],
    );

    const privilegeChange = useCallback(
      (treeData: DataSourceTreeNode[]) =>
        (
          record: DataSourceTreeNode,
          newPermissionArray: PermissionLevels[],
          index: number,
          base: PermissionLevels,
        ) => {
          if (viewpoint === Viewpoints.Subject) {
            // 找到变化的的单条资源，设置它及其子资源权限
            const changedTreeData = getTreeNodeWithPermission(
              treeData,
              ({ id, permissionArray, path }, parentPermissionArray) =>
                id === record.id
                  ? newPermissionArray
                  : path.includes(record.id)
                  ? getChangedPermission(
                      parentPermissionArray[index] === PermissionLevels.Disable,
                      permissionArray,
                      index,
                      base,
                    )
                  : permissionArray,
              getDefaultPermissionArray(),
            );
            // 根据改变后的树重新计算出权限列表
            const recalculatedPrivileges = getRecalculatedPrivileges(
              changedTreeData,
              viewpoint,
              viewpointType,
              viewpointId,
              orgId,
            );
            // 根据新旧权限列表计算出请求参数
            const { created, updated, deleted, reserved } = getPrivilegeResult(
              [...privileges!],
              recalculatedPrivileges,
            );
            dispatch(
              grantPermissions({
                params: {
                  permissionToCreate: created,
                  permissionToDelete: deleted,
                  permissionToUpdate: updated,
                },
                options: { viewpoint, viewpointType, dataSourceType, reserved },
                resolve: () => {},
              }),
            );
          } else {
            let changedPrivilege: Privilege | undefined;
            const params: GrantPermissionParams['params'] = {
              permissionToCreate: [],
              permissionToDelete: [],
              permissionToUpdate: [],
            };
            let reserved: Privilege[] = [];
            const newPermission = calcPermission(newPermissionArray);

            if (
              calcPermission(record.permissionArray) ===
              PermissionLevels.Disable
            ) {
              changedPrivilege = {
                orgId,
                resourceId: viewpointId,
                resourceType: viewpointType as ResourceTypes,
                subjectId: record.id,
                subjectType: record.type as SubjectTypes,
                permission: newPermission,
              };
              params.permissionToCreate.push(changedPrivilege);
              reserved = [...privileges!];
            } else {
              privileges!.forEach(p => {
                if (p.subjectId === record.id) {
                  changedPrivilege = {
                    ...p,
                    permission: newPermission,
                  };

                  if (newPermission === PermissionLevels.Disable) {
                    params.permissionToDelete.push(changedPrivilege);
                  } else {
                    params.permissionToUpdate.push(changedPrivilege);
                    reserved.push(changedPrivilege);
                  }
                } else {
                  reserved.push(p);
                }
              });
            }
            dispatch(
              grantPermissions({
                params,
                options: { viewpoint, viewpointType, dataSourceType, reserved },
                resolve: () => {},
              }),
            );
          }
        },
      [
        dispatch,
        viewpoint,
        viewpointId,
        viewpointType,
        dataSourceType,
        orgId,
        privileges,
      ],
    );

    return (
      <Wrapper className={classnames({ selected })}>
        <LoadingMask loading={permissionLoading}>
          <FormContent
            labelAlign="left"
            labelCol={{ span: 3 }}
            wrapperCol={{ span: 19 }}
          >
            {viewpoint === Viewpoints.Subject && (
              <IndependentPermissionSetting
                enabled={moduleEnabled}
                label="功能权限"
                extra="开启功能权限之后，用户才能在 Datart 界面上使用该功能"
                values={MODULE_PERMISSION_VALUES}
                onChange={independentPermissionChange('*')}
              />
            )}
            {viewpoint === Viewpoints.Subject &&
              ![ResourceTypes.Viz, ResourceTypes.View].includes(
                dataSourceType as ResourceTypes,
              ) && (
                <IndependentPermissionSetting
                  enabled={createEnabled}
                  label={`新增${RESOURCE_TYPE_LABEL[dataSourceType]}`}
                  values={CREATE_PERMISSION_VALUES}
                  onChange={independentPermissionChange(dataSourceType)}
                />
              )}
            <Form.Item label="资源明细">
              <PermissionTable
                viewpoint={viewpoint}
                viewpointType={viewpointType}
                dataSourceType={dataSourceType}
                dataSource={dataSource}
                resourceLoading={resourceLoading}
                privileges={privileges}
                onPrivilegeChange={privilegeChange}
              />
            </Form.Item>
          </FormContent>
        </LoadingMask>
      </Wrapper>
    );
  },
);

const Wrapper = styled.div`
  display: none;

  &.selected {
    position: relative;
    display: block;
  }
`;

const FormContent = styled(Form)`
  width: 960px;
`;
